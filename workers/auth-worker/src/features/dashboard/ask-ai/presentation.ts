import type { Context } from 'hono';
import { Hono } from 'hono';
import { generateText, stepCountIs } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { requireAuth } from '../../auth/authMiddleware';
import { createWebsocketApplicationService } from '../../ws/application';
import { handleError } from '../../../shared/utils';
import { buildAskAiTools, type SuggestedNav } from './ask-ai-tools';
import { loadEpisodic, persistEpisodic, summarizeLast10Messages } from './episodic-memory';
import { scoreMessageImportance } from './importance';
import { embedMessageText, querySemanticForPrompt, upsertSemanticIfWorthy } from './semantic-memory';

async function notifyAskAiProgress(
  c: Context<{ Bindings: Env }>,
  bindingName: string,
  identifier: string,
  requestId: string,
  step: { id: string; label: string; status: 'running' | 'done' | 'error' },
): Promise<void> {
  try {
    const ws = createWebsocketApplicationService(c, bindingName);
    await ws.sendNotificationToUserUseCase(identifier, {
      title: '\u200b',
      body: undefined,
      data: {
        channel: 'ask-ai',
        requestId,
        stepId: step.id,
        label: step.label,
        status: step.status,
      },
    });
  } catch {
    // best-effort
  }
}

/** Codebase context — đồng bộ với workers/web _data/codebase-context.ts */
const CODEBASE_CONTEXT = `## API Endpoints & Schemas

### Tạo đơn hàng: POST /dashboard/order/orders
Body: { items: [{ serviceId: number, basePrice: number, quantity: number }], currency?: string, voucherCode?: string, notes?: string }
- items: array, mỗi item có serviceId (number), basePrice (number), quantity (number)

### Tạo API Key: POST /dashboard/token/create
Body: { name: string }

### Lịch sử đơn hàng: GET /dashboard/order/history
Query: fromDate (YYYY-MM-DD), toDate (YYYY-MM-DD), limit?, offset?

### Danh sách đơn: GET /dashboard/order/orders
Query: status?, targetType?, page?, limit?

### Logs: GET /dashboard/monitor/logs
Query: dateFrom (timestamp ms), dateTo (timestamp ms), serviceId?, endpoint?, limit?, offset?
Lưu ý: dateFrom/dateTo cần convert từ YYYY-MM-DD sang timestamp: new Date(date).getTime()

### Thống kê default: GET /dashboard/admin/default-stats
Trả về: totalRevenue, newCustomers, activeAccounts, apiErrorRate, visitorsByDate[{date,count}], visitorsByCountry[{country,count}]

### Thống kê tài chính: GET /dashboard/admin/finance-stats
Trả về: totalRevenue, totalOrders, revenueByDay[{date,revenue,orders}], revenueByMonth, ordersByStatus

### Phân tích: GET /dashboard/monitor/analytics
Query: duration?

### Hoa hồng: GET /dashboard/referral/commissions
Query: period?, limit?
`;

const SYSTEM_PROMPT = `Bạn là trợ lý AI của APIHub. Phản hồi NGẮN GỌN, ĐÚNG CẤU TRÚC. KHÔNG dừng giữa chừng.

Bạn có thể gọi tools (search_semantic_memory, suggest_dashboard_navigation) khi cần. Sau khi xong mọi bước tool, phản hồi CUỐI CÙNG phải là ĐÚNG MỘT JSON thuần (không markdown), cùng format như dưới.

Bối cảnh:
${CODEBASE_CONTEXT}

QUAN TRỌNG - Field types cho form:
- date → type "date" (YYYY-MM-DD)
- datetime → type "datetime"
- số → type "number"
- boolean → type "boolean"
- danh sách chọn → type "select", options: [{value, label}]
- text thường → type "text"

Luôn trả về ĐÚNG MỘT JSON, không markdown:
{"type":"text|form|table|chart|multidim","content":"Mô tả ngắn","payload":...}

- text: Chỉ content, payload null. Không viết "Thống kê như sau:" rồi dừng - phải gọi type chart/table.
- form: endpoint, method, schema.fields: [{name, type, label, required, options?}]. Dùng đúng type (date, number...).
- table: endpoint, queryParams (object), columns: [{key, label}]
- chart: Khi thống kê → type="chart". payload: { chartType, endpoint, dataPath, dataKey, nameKey }
  + dataPath BẮT BUỘC khi endpoint trả object: "visitorsByDate"|"visitorsByCountry"|"revenueByDay"|"revenueByMonth"|"ordersByStatus"
  + default-stats: dataPath="visitorsByDate", dataKey="count", nameKey="date"
  + finance-stats: dataPath="revenueByDay", dataKey="revenue", nameKey="date"
- multidim: dimensions, metrics, data hoặc endpoint

VÍ DỤ thống kê doanh thu:
{"type":"chart","content":"Biểu đồ doanh thu theo ngày","payload":{"chartType":"line","endpoint":"/dashboard/admin/finance-stats","dataPath":"revenueByDay","dataKey":"revenue","nameKey":"date"}}

VÍ DỤ thống kê visitors:
{"type":"chart","content":"Lượt truy cập theo ngày","payload":{"chartType":"bar","endpoint":"/dashboard/admin/default-stats","dataPath":"visitorsByDate","dataKey":"count","nameKey":"date"}}

VÍ DỤ form logs:
{"type":"form","content":"Lọc logs theo khoảng thời gian","payload":{"endpoint":"/dashboard/monitor/logs","method":"GET","schema":{"fields":[{"name":"dateFrom","type":"date","label":"Từ ngày","required":true},{"name":"dateTo","type":"date","label":"Đến ngày","required":true}]}}}

Chỉ output JSON thuần cho bước cuối, không \\\`\\\`\\\`json.`;

function extractJsonObject(raw: string): string | null {
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

async function runLegacyChat(
  ai: Ai,
  userPrompt: string,
): Promise<{ type: string; content: string; payload?: unknown }> {
  const response = await ai.run(
    '@cf/meta/llama-3.1-8b-instruct-fp8',
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2048,
    },
    { gateway: { id: 'unitoken' } },
  );
  const raw =
    (response as { response?: string })?.response ??
    (response as { result?: { response?: string } })?.result?.response ??
    String(response);
  let parsed: { type: string; content: string; payload?: unknown } = { type: 'text', content: raw, payload: null };
  const j = extractJsonObject(raw);
  if (j) {
    try {
      parsed = JSON.parse(j);
    } catch {
      parsed.content = raw;
    }
  }
  return parsed;
}

export function createAskAiRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.post('/chat', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json().catch(() => ({}));
      const { message, history = [], requestId: clientRequestId } = body as {
        message: string;
        history?: Array<{ role: string; content: string }>;
        requestId?: string;
      };
      if (!message || typeof message !== 'string') {
        return c.json({ error: 'message is required' }, 400);
      }

      const requestId =
        typeof clientRequestId === 'string' && clientRequestId.length > 0 ? clientRequestId : crypto.randomUUID();

      const ai = c.env.AI;
      if (!ai) {
        return c.json({ error: 'AI not configured' }, 503);
      }

      const userKey = user.identifier;

      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'receive',
        label: 'Đã nhận yêu cầu',
        status: 'done',
      });
      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'memory',
        label: 'Đang tải bộ nhớ (episodic + semantic)…',
        status: 'running',
      });

      const episodic = await loadEpisodic(c.env, userKey);
      let semanticBlock = '';
      let userEmbedding: number[] | null = null;
      try {
        userEmbedding = await embedMessageText(ai, message);
        semanticBlock = await querySemanticForPrompt(c.env, userKey, userEmbedding, Date.now());
      } catch {
        semanticBlock = '';
      }

      const importance = await scoreMessageImportance(ai, message).catch(() => 0.35);

      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'memory',
        label: 'Đã tải bộ nhớ',
        status: 'done',
      });

      const memoryBlock = [
        episodic.episodicSummary
          ? `## Bộ nhớ sự kiện (tóm tắt tối đa 10 tin gần nhất)\n${episodic.episodicSummary}`
          : '',
        semanticBlock || '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const histMessages = (history ?? [])
        .slice(-10)
        .filter((h) => h.role === 'user' || h.role === 'assistant')
        .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content }));

      const suggestedNav: SuggestedNav[] = [];

      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'infer',
        label: 'Đang gọi mô hình AI (AI SDK + tools)…',
        status: 'running',
      });

      const workersai = createWorkersAI({ binding: ai, gateway: { id: 'unitoken' } });
      const model = workersai.chat('@cf/meta/llama-3.1-8b-instruct-fp8');
      const tools = buildAskAiTools({ ai, env: c.env, userKey, suggestedNav });

      let parsed: { type: string; content: string; payload?: unknown };
      let rawOut: string;

      try {
        const result = await generateText({
          model,
          messages: [
            {
              role: 'system',
              content: memoryBlock ? `${SYSTEM_PROMPT}\n\n${memoryBlock}` : SYSTEM_PROMPT,
            },
            ...histMessages,
            { role: 'user', content: message },
          ],
          tools,
          stopWhen: stepCountIs(10),
          maxOutputTokens: 2048,
        });
        rawOut = result.text;
        const j = extractJsonObject(rawOut);
        if (j) {
          try {
            parsed = JSON.parse(j) as { type: string; content: string; payload?: unknown };
          } catch {
            parsed = { type: 'text', content: rawOut, payload: null };
          }
        } else {
          parsed = { type: 'text', content: rawOut, payload: null };
        }
      } catch {
        const userPrompt =
          histMessages.length > 0
            ? histMessages.map((h) => `${h.role}: ${h.content}`).join('\n') + `\nuser: ${message}`
            : message;
        const memPrefix = memoryBlock ? `${memoryBlock}\n\n` : '';
        parsed = await runLegacyChat(ai, memPrefix + userPrompt);
        rawOut = parsed.content;
      }

      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'infer',
        label: 'Đã nhận phản hồi từ mô hình',
        status: 'done',
      });
      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'parse',
        label: 'Đang chuẩn hóa dữ liệu…',
        status: 'running',
      });

      const now = Date.now();
      const last10Lines = [...histMessages, { role: 'user' as const, content: message }, { role: 'assistant' as const, content: parsed.content ?? '' }]
        .slice(-10)
        .map((m, i) => ({
          role: m.role,
          content: m.content,
          at: now - (10 - i) * 1000,
        }));
      const episodicSummary = await summarizeLast10Messages(ai, last10Lines.map(({ role, content }) => ({ role, content }))).catch(
        () => episodic.episodicSummary,
      );
      await persistEpisodic(c.env, userKey, { episodicSummary, last10: last10Lines }).catch(() => {});

      if (userEmbedding) {
        await upsertSemanticIfWorthy({
          env: c.env,
          ai,
          userKey,
          messageText: message,
          importance,
          embedding: userEmbedding,
        }).catch(() => {});
      }

      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'parse',
        label: 'Đã chuẩn hóa phản hồi',
        status: 'done',
      });
      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'complete',
        label: 'Hoàn tất',
        status: 'done',
      });

      return c.json({
        type: parsed.type || 'text',
        content: parsed.content || rawOut,
        payload: parsed.payload ?? null,
        requestId,
        suggestedActions: suggestedNav.length > 0 ? suggestedNav : undefined,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Ask AI failed');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
