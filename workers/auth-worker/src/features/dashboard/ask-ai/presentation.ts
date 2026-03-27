import type { Context } from 'hono';
import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { createWebsocketApplicationService } from '../../ws/application';
import { handleError } from '../../../shared/utils';

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
        channel: "ask-ai",
        requestId,
        stepId: step.id,
        label: step.label,
        status: step.status,
      },
    });
  } catch {
    // Tiến trình là best-effort; không làm fail request chat
  }
}

/** Codebase context - đồng bộ với workers/web _data/codebase-context.ts */
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

Chỉ output JSON thuần, không \`\`\`json.`;

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

      const userPrompt = history.length > 0
        ? history.map((h: { role: string; content: string }) => `${h.role}: ${h.content}`).join('\n') + `\nuser: ${message}`
        : message;

      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'receive',
        label: 'Đã nhận yêu cầu',
        status: 'done',
      });
      await notifyAskAiProgress(c, bindingName, user.identifier, requestId, {
        id: 'infer',
        label: 'Đang gọi mô hình AI…',
        status: 'running',
      });

      const response = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2048,
      }, { gateway: { id: "unitoken" } });

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

      const raw = (response as { response?: string })?.response ?? (response as { result?: { response?: string } })?.result?.response ?? String(response);
      let parsed: { type: string; content: string; payload?: unknown } = { type: 'text', content: raw, payload: null };

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed.content = raw;
        }
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
        content: parsed.content || raw,
        payload: parsed.payload ?? null,
        requestId,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Ask AI failed');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
