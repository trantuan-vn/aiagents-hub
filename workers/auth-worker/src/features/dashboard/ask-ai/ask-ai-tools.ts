import { tool } from 'ai';
import { z } from 'zod';

import { CreateOrderSchema } from '../../member/order/domain';
import { CreateApiTokenSchema } from '../../member/token/domain';

import { type VectorizeEnv } from './semantic-memory';
import { forceReindexAskAiKnowledge, type KnowledgeIngestEnv } from './knowledge-ingest';

export type AskAiToolActions = {
  createApiToken: (input: z.infer<typeof CreateApiTokenSchema>) => Promise<unknown>;
  revokeApiToken: (tokenId: number) => Promise<unknown>;
  createOrder: (input: z.infer<typeof CreateOrderSchema>) => Promise<unknown>;
};

/** Nhãn hiển thị cho tiến trình (WebSocket + UI) — đồng bộ với workers/web nếu thêm tool mới. */
export function askAiToolLabelVi(toolName: string): string {
  switch (toolName) {
    case 'create_api_key':
      return 'Tạo API key';
    case 'revoke_api_key':
      return 'Thu hồi API key';
    case 'create_order':
      return 'Tạo đơn hàng';
    case 'reindex_ask_ai_knowledge':
      return 'Cập nhật chỉ mục tài liệu (Vectorize)';
    default:
      return toolName;
  }
}

/**
 * Tools cho streamText (Vercel AI SDK + workers-ai-provider).
 */
export function buildAskAiTools(opts: {
  ai: Ai;
  env: VectorizeEnv & KnowledgeIngestEnv;
  actions: AskAiToolActions;
  isAdmin: boolean;
}) {
  const { ai, env, actions, isAdmin } = opts;

  const create_api_key = tool({
    description:
      'Tạo API key (POST /dashboard/token/create). Nếu thiếu `name`, KHÔNG gọi thành công — trả về hướng dẫn để model hiển thị form/modal bổ sung.',
    inputSchema: z.object({
      name: z.string().optional(),
      expiresInDays: z.number().int().min(1).max(3650).optional(),
      permissions: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      const name = input.name?.trim();
      if (!name) {
        return JSON.stringify({
          status: 'needs_input',
          reason: 'Thiếu tên API key (name).',
          form: {
            endpoint: '/dashboard/token/create',
            method: 'POST',
            displayMode: 'modal',
            formTitle: 'Tạo API key',
            schema: {
              fields: [
                { name: 'name', type: 'text', label: 'Tên key', required: true },
                {
                  name: 'expiresInDays',
                  type: 'number',
                  label: 'Hết hạn (ngày)',
                  required: false,
                },
              ],
            },
          },
        });
      }
      const body = CreateApiTokenSchema.parse({
        name,
        expiresInDays: input.expiresInDays,
        permissions: input.permissions ?? [],
      });
      const result = await actions.createApiToken(body);
      return JSON.stringify({ status: 'ok', result });
    },
  });

  const revoke_api_key = tool({
    description: 'Thu hồi một API key theo tokenId (DELETE /dashboard/token/revoke/:tokenId).',
    inputSchema: z.object({ tokenId: z.number().int().positive().optional() }),
    execute: async ({ tokenId }) => {
      if (!tokenId) {
        return JSON.stringify({
          status: 'needs_input',
          reason: 'Thiếu tokenId (id số của key trong danh sách).',
          form: {
            endpoint: '/dashboard/token/revoke',
            method: 'DELETE',
            displayMode: 'modal',
            formTitle: 'Thu hồi API key',
            schema: {
              fields: [{ name: 'tokenId', type: 'number', label: 'ID API key', required: true }],
            },
          },
        });
      }
      const result = await actions.revokeApiToken(tokenId);
      return JSON.stringify({ status: 'ok', result });
    },
  });

  const create_order = tool({
    description:
      'Tạo đơn hàng (POST /dashboard/order/orders). items: [{ serviceId, basePrice, quantity }]. Nếu thiếu trường bắt buộc, trả needs_input + form.',
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            serviceId: z.number().int().positive(),
            basePrice: z.number().min(0),
            quantity: z.number().min(1),
          }),
        )
        .optional(),
      currency: z.string().optional(),
      voucherCode: z.string().optional(),
      notes: z.string().optional(),
    }),
    execute: async (input) => {
      if (!input.items || input.items.length === 0) {
        return JSON.stringify({
          status: 'needs_input',
          reason: 'Thiếu danh sách dịch vụ (items).',
          form: {
            endpoint: '/dashboard/order/orders',
            method: 'POST',
            displayMode: 'modal',
            formTitle: 'Tạo đơn hàng',
            schema: {
              fields: [
                {
                  name: 'serviceId',
                  type: 'number',
                  label: 'Service ID',
                  required: true,
                },
                { name: 'basePrice', type: 'number', label: 'Đơn giá', required: true },
                { name: 'quantity', type: 'number', label: 'Số lượng', required: true },
                { name: 'currency', type: 'text', label: 'Tiền tệ', required: false },
                { name: 'voucherCode', type: 'text', label: 'Mã voucher', required: false },
                { name: 'notes', type: 'text', label: 'Ghi chú', required: false },
              ],
            },
          },
        });
      }
      const parsed = CreateOrderSchema.safeParse({
        items: input.items,
        currency: input.currency ?? 'VND',
        voucherCode: input.voucherCode,
        notes: input.notes,
      });
      if (!parsed.success) {
        return JSON.stringify({
          status: 'needs_input',
          reason: parsed.error.message,
          form: {
            endpoint: '/dashboard/order/orders',
            method: 'POST',
            displayMode: 'modal',
            formTitle: 'Tạo đơn hàng',
            schema: {
              fields: [
                { name: 'serviceId', type: 'number', label: 'Service ID', required: true },
                { name: 'basePrice', type: 'number', label: 'Đơn giá', required: true },
                { name: 'quantity', type: 'number', label: 'Số lượng', required: true },
                { name: 'currency', type: 'text', label: 'Tiền tệ', required: false },
                { name: 'voucherCode', type: 'text', label: 'Mã voucher', required: false },
                { name: 'notes', type: 'text', label: 'Ghi chú', required: false },
              ],
            },
          },
        });
      }
      const result = await actions.createOrder(parsed.data);
      return JSON.stringify({ status: 'ok', result });
    },
  });

  const base = {
    create_api_key,
    revoke_api_key,
    create_order,
  };

  if (!isAdmin) {
    return base;
  }

  return {
    ...base,
    reindex_ask_ai_knowledge: tool({
      description:
        'Admin: đọc lại file openapi.md + code-examples.md và ghi vào Vectorize (khi cập nhật tài liệu).',
      inputSchema: z.object({}),
      execute: async () => {
        await forceReindexAskAiKnowledge(env, ai);
        return 'Đã cập nhật chỉ mục tài liệu Ask AI (Vectorize).';
      },
    }),
  };
}
