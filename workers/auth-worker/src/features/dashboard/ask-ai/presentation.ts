import type { Context } from 'hono';
import { Hono } from 'hono';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import type { UIMessage } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { requireAuth } from '../../auth/authMiddleware';
import { createWebsocketApplicationService } from '../../ws/application';
import { handleError, isAdmin } from '../../../shared/utils';
import { createOrderApplicationService } from '../../member/order/application';
import { createTokenApplicationService } from '../../member/token/application';
import { askAiToolLabelVi, buildAskAiTools } from './ask-ai-tools';
import { loadEpisodic, persistEpisodic, summarizeLast10Messages } from './episodic-memory';
import { ensureAskAiKnowledgeVectorized } from './knowledge-ingest';
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

const SYSTEM_PROMPT = `Bạn là trợ lý APIHub.

Phần ngữ cảnh bổ sung (nếu có) nằm ngay sau khối hướng dẫn này trong tin system:
- Khối "10 tin nhắn gần nhất (lưu UserDO)": tối đa 10 lượt user/assistant đã lưu trên Durable Object.
- Khối "Bộ nhớ ngữ nghĩa": đoạn trích từ vector DB (tài liệu API + ký ức cá nhân), đã lấy theo embedding của tin nhắn user hiện tại — dùng làm schema/endpoint và preference, không cần tool tìm thêm.

Thao tác thật (tạo key, thu hồi key, tạo đơn): dùng tools create_api_key, revoke_api_key, create_order. Sau tool, nếu JSON trả về có status "needs_input" và form → bạn PHẢI trả ĐÚNG MỘT JSON type "form" với payload.form giống tool (displayMode "modal", formTitle, endpoint, method, schema.fields) để người dùng điền; không bịa dữ liệu.

Khi đã đủ thông tin và tool trả status "ok": tóm tắt ngắn gọn việc đã làm (tiếng Việt), không lộ secret (raw token chỉ nhắc là đã tạo, xem phản hồi JSON).

Các việc khác (logs, biểu đồ, bảng): phản hồi cuối là ĐÚNG MỘT JSON thuần (không markdown):

{"type":"text|form|table|chart|multidim","content":"...","payload":...}

- text: payload null hoặc bỏ qua.
- form: payload có endpoint, method, schema.fields; có thể thêm displayMode "modal", formTitle (form bổ sung thông tin).
- chart/table/multidim: giữ quy ước cũ (dataPath cho chart khi API trả object lồng).

Field form: date|datetime|number|boolean|select|text.

Chỉ output JSON cho bước cuối, không bọc markdown.`;

function extractJsonObject(raw: string): string | null {
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function parseModelJsonOutput(rawOut: string): { type: string; content: string; payload?: unknown } {
  const j = extractJsonObject(rawOut);
  if (j) {
    try {
      return JSON.parse(j) as { type: string; content: string; payload?: unknown };
    } catch {
      return { type: 'text', content: rawOut, payload: null };
    }
  }
  return { type: 'text', content: rawOut, payload: null };
}

function getLastUserPlainTextFromUiMessages(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      const text = m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
      const t = text.trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

function uiMessagesToRoleContentPairs(messages: UIMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(''),
    }))
    .filter((m) => m.content.length > 0);
}

const MAX_EPISODIC_MSG_CHARS = 4000;

/** Định dạng last10 từ UserDO (episodic) cho system prompt. */
function formatLast10UserDoBlock(
  last10: Array<{ role: string; content: string; at: number }>,
): string {
  if (last10.length === 0) return '';
  const lines = last10.map((m) => {
    const r = m.role === 'assistant' || m.role === 'user' ? m.role : 'user';
    const c = String(m.content ?? '').slice(0, MAX_EPISODIC_MSG_CHARS);
    return `${r}: ${c}`;
  });
  return `## 10 tin nhắn gần nhất (lưu UserDO)\n${lines.join('\n\n')}`;
}

/** Bối cảnh: tin nhắn đã lưu (UserDO) + đoạn vector liên quan tin user hiện tại. */
function buildAskAiContextBlock(
  episodic: { episodicSummary: string; last10: Array<{ role: string; content: string; at: number }> },
  semanticBlock: string,
): string {
  const parts: string[] = [];
  const last10Block = formatLast10UserDoBlock(episodic.last10);
  if (last10Block) {
    parts.push(last10Block);
  } else if (episodic.episodicSummary?.trim()) {
    parts.push(`## Tóm tắt hội thoại trước (chưa có log 10 tin)\n${episodic.episodicSummary.trim()}`);
  }
  if (semanticBlock?.trim()) {
    parts.push(semanticBlock.trim());
  }
  return parts.join('\n\n');
}

async function persistEpisodicAndSemantic(opts: {
  ai: Ai;
  env: Env;
  userKey: string;
  pairs: Array<{ role: 'user' | 'assistant'; content: string }>;
  assistantContent: string;
  episodicSummaryFallback: string;
  userEmbedding: number[] | null;
  lastUserText: string;
  importance: number;
}): Promise<void> {
  const now = Date.now();
  const last10Lines = [...opts.pairs, { role: 'assistant' as const, content: opts.assistantContent }]
    .slice(-10)
    .map((m, i) => ({
      role: m.role,
      content: m.content,
      at: now - (10 - i) * 1000,
    }));
  const episodicSummary = await summarizeLast10Messages(
    opts.ai,
    last10Lines.map(({ role, content }) => ({ role, content })),
  ).catch(() => opts.episodicSummaryFallback ?? '');
  await persistEpisodic(opts.env, opts.userKey, { episodicSummary, last10: last10Lines }).catch(() => {});

  if (opts.userEmbedding) {
    await upsertSemanticIfWorthy({
      env: opts.env,
      ai: opts.ai,
      userKey: opts.userKey,
      messageText: opts.lastUserText,
      importance: opts.importance,
      embedding: opts.userEmbedding,
    }).catch(() => {});
  }
}

type AskAiMessageMetadata = {
  requestId?: string;
};

export function createAskAiRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.post('/chat', async (c) => {
    try {
      const user = requireAuth(c);
      const body = await c.req.json().catch(() => ({}));

      const ai = c.env.AI;
      if (!ai) {
        return c.json({ error: 'AI not configured' }, 503);
      }

      await ensureAskAiKnowledgeVectorized(c.env, ai).catch(() => {});

      const userKey = user.identifier;
      const tokenService = createTokenApplicationService(c, bindingName);
      const orderService = createOrderApplicationService(c, bindingName);

      if (!Array.isArray((body as { messages?: unknown }).messages)) {
        return c.json({ error: 'messages array is required' }, 400);
      }

      const { messages: uiMessages, requestId: clientRequestId } = body as {
        messages: UIMessage[];
        requestId?: string;
      };
      if (!uiMessages.length) {
        return c.json({ error: 'messages is required' }, 400);
      }
      const lastUserText = getLastUserPlainTextFromUiMessages(uiMessages);
      if (!lastUserText) {
        return c.json({ error: 'last user message is required' }, 400);
      }

      const requestId =
        typeof clientRequestId === 'string' && clientRequestId.length > 0 ? clientRequestId : crypto.randomUUID();

      const notify = (step: { id: string; label: string; status: 'running' | 'done' | 'error' }) =>
        notifyAskAiProgress(c, bindingName, user.identifier, requestId, step);

      await notify({ id: 'receive', label: 'Đã nhận yêu cầu', status: 'done' });
      await notify({ id: 'memory', label: 'Đang tải ngữ cảnh (UserDO + vector)…', status: 'running' });

      const episodic = await loadEpisodic(c.env, userKey);

      let semanticBlock = '';
      let userEmbedding: number[] | null = null;
      try {
        userEmbedding = await embedMessageText(ai, lastUserText);
        semanticBlock = await querySemanticForPrompt(c.env, userKey, userEmbedding, Date.now());
      } catch {
        semanticBlock = '';
      }

      const importance = await scoreMessageImportance(ai, lastUserText).catch(() => 0.35);

      await notify({ id: 'memory', label: 'Đã tải bộ nhớ', status: 'done' });

      const contextBlock = buildAskAiContextBlock(episodic, semanticBlock);

      await notify({ id: 'infer', label: 'Đang gọi mô hình AI (stream + tools)…', status: 'running' });

      const workersai = createWorkersAI({ binding: ai, gateway: { id: 'unitoken' } });
      const model = workersai.chat('@cf/meta/llama-3.1-8b-instruct-fp8');
      const tools = buildAskAiTools({
        ai,
        env: c.env,
        isAdmin: isAdmin(user.identifier),
        actions: {
          createApiToken: (input) => tokenService.createApiTokenUseCase(user.identifier, input),
          revokeApiToken: (tokenId) =>
            tokenService.revokeApiTokenUseCase(user.identifier, { tokenId }),
          createOrder: (input) => orderService.createOrder(user, input),
        },
      });

      let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
      try {
        modelMessages = await convertToModelMessages(uiMessages);
      } catch {
        return c.json({ error: 'Invalid messages payload' }, 400);
      }

      const systemContent = contextBlock ? `${SYSTEM_PROMPT}\n\n${contextBlock}` : SYSTEM_PROMPT;

      let result;
      try {
        result = streamText({
          model,
          messages: [{ role: 'system', content: systemContent }, ...modelMessages],
          tools,
          stopWhen: stepCountIs(10),
          maxOutputTokens: 2048,
          experimental_onStepStart: async ({ stepNumber }) => {
            if (stepNumber >= 1) {
              await notify({
                id: `llm-step-${stepNumber}`,
                label: `Lượt ${stepNumber + 1}: đang gọi mô hình…`,
                status: 'running',
              });
            }
          },
          experimental_onToolCallStart: async ({ toolCall }) => {
            const name = String(toolCall.toolName);
            await notify({
              id: `tool-${toolCall.toolCallId}`,
              label: `Đang chạy: ${askAiToolLabelVi(name)}…`,
              status: 'running',
            });
          },
          experimental_onToolCallFinish: async ({ toolCall, success, error }) => {
            const name = String(toolCall.toolName);
            const label = askAiToolLabelVi(name);
            const errHint =
              success || error === undefined ? '' : ` — ${error instanceof Error ? error.message : String(error)}`;
            await notify({
              id: `tool-${toolCall.toolCallId}`,
              label: success ? `Đã xong: ${label}` : `Lỗi tool: ${label}${errHint}`,
              status: success ? 'done' : 'error',
            });
          },
          onFinish: async (event) => {
            const parsed = parseModelJsonOutput(event.text);

            await notify({ id: 'infer', label: 'Đã nhận phản hồi từ mô hình', status: 'done' });
            await notify({ id: 'parse', label: 'Đang chuẩn hóa dữ liệu…', status: 'running' });

            const pairs = uiMessagesToRoleContentPairs(uiMessages);
            await persistEpisodicAndSemantic({
              ai,
              env: c.env,
              userKey,
              pairs,
              assistantContent: parsed.content ?? '',
              episodicSummaryFallback: episodic.episodicSummary,
              userEmbedding,
              lastUserText,
              importance,
            });

            await notify({ id: 'parse', label: 'Đã chuẩn hóa phản hồi', status: 'done' });
            await notify({ id: 'complete', label: 'Hoàn tất', status: 'done' });
          },
        });
      } catch (e) {
        await notify({ id: 'infer', label: 'Lỗi khi gọi mô hình', status: 'error' });
        const { errorResponse, status } = await handleError(c, e, 'Ask AI stream failed');
        return c.json(errorResponse, status);
      }

      return result.toUIMessageStreamResponse({
        originalMessages: uiMessages,
        headers: {
          'Access-Control-Expose-Headers': 'X-Request-Id',
          'X-Request-Id': requestId,
        },
        messageMetadata: ({ part }): AskAiMessageMetadata | undefined => {
          if (part.type === 'finish') {
            return { requestId };
          }
          return undefined;
        },
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, 'Ask AI failed');
      return c.json(errorResponse, status);
    }
  });

  return app;
}
