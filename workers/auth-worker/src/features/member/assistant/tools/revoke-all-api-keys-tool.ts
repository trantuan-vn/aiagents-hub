import { tool } from 'ai';
import { z } from 'zod';

import { createTokenApplicationService } from '../../token/application';

export function revokeAllApiKeysTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Thu hoi toan bo API key cua user da dang nhap.',
    inputSchema: z.object({}),
    async *execute() {
      yield { state: 'loading' as const };

      try {
        const tokenService = createTokenApplicationService(c, bindingName);
        const result = await tokenService.revokeAllApiTokensUseCase(user.identifier);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to revoke all API keys';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
