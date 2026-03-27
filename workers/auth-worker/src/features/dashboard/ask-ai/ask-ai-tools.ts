import { tool } from 'ai';
import { z } from 'zod';

import { embedMessageText, querySemanticForPrompt, type VectorizeEnv } from './semantic-memory';

export type SuggestedNav = { label: string; path: string };

/**
 * Tools cho generateText (Vercel AI SDK + workers-ai-provider).
 * Thêm tool mới: khai báo thêm field trong object return.
 */
export function buildAskAiTools(opts: {
  ai: Ai;
  env: VectorizeEnv;
  userKey: string;
  suggestedNav: SuggestedNav[];
}) {
  const { ai, env, userKey, suggestedNav } = opts;

  return {
    search_semantic_memory: tool({
      description:
        'Tìm trong bộ nhớ ngữ nghĩa các thông tin đã lưu liên quan tới truy vấn (preference, số liệu, mục tiêu trước đó).',
      inputSchema: z.object({ query: z.string().min(1) }),
      execute: async ({ query }) => {
        try {
          const emb = await embedMessageText(ai, query);
          const block = await querySemanticForPrompt(env, userKey, emb, Date.now());
          return block || '(Không có kết quả trong bộ nhớ ngữ nghĩa.)';
        } catch (e) {
          return `Lỗi search_semantic_memory: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    }),

    suggest_dashboard_navigation: tool({
      description:
        'Đăng ký một nút để người dùng mở màn hình dashboard trong panel (path bắt đầu bằng /dashboard).',
      inputSchema: z.object({
        label: z.string().min(1),
        path: z.string().min(1),
      }),
      execute: async ({ label, path }) => {
        const p = path.trim();
        if (!p.startsWith('/dashboard')) {
          return 'Chỉ chấp nhận path trong /dashboard/*';
        }
        suggestedNav.push({ label: label.trim(), path: p });
        return `Đã ghi nhận nút điều hướng: ${label}`;
      },
    }),
  };
}
