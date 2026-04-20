import { tool } from 'ai';
import { z } from 'zod';

import { createTokenApplicationService } from '../../member/token/application';

export function listApiKeysTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Lay danh sach API key hien co cua user da dang nhap.',
    inputSchema: z.object({}),
    async *execute() {
      yield { state: 'loading' as const };

      try {
        const tokenService = createTokenApplicationService(c, bindingName);
        const result = await tokenService.getUserApiTokensUseCase(user.identifier);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list API keys';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
