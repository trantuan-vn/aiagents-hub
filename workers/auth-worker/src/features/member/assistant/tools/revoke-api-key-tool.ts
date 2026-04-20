import { tool } from 'ai';
import { z } from 'zod';

import { createTokenApplicationService } from '../../token/application';

const RevokeApiKeyInputSchema = z.object({
  tokenId: z.number().int().positive(),
});

export function revokeApiKeyTool(c: any, bindingName: string, user: any) {
  return tool({
    description: 'Thu hoi mot API key theo tokenId cua user da dang nhap.',
    inputSchema: RevokeApiKeyInputSchema,
    async *execute(input: z.infer<typeof RevokeApiKeyInputSchema>) {
      yield { state: 'loading' as const };

      try {
        const tokenService = createTokenApplicationService(c, bindingName);
        const result = await tokenService.revokeApiTokenUseCase(user.identifier, input);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to revoke API key';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
