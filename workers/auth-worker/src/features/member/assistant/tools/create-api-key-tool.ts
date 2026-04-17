import { tool } from 'ai';
import { z } from 'zod';

import { createTokenApplicationService } from '../../token/application';
import { CreateApiTokenSchema } from '../../token/domain';

export function createApiKeyTool(c: any, bindingName: string, user: any) {
  return tool({
    description:
      'Tao API key (token) moi cho user da dang nhap. Can ten token; quyen va so ngay het han la tuy chon.',
    inputSchema: CreateApiTokenSchema,
    async *execute(input: z.infer<typeof CreateApiTokenSchema>) {
      yield { state: 'loading' as const };

      try {
        const request = CreateApiTokenSchema.parse(input);
        const tokenService = createTokenApplicationService(c, bindingName);
        const result = await tokenService.createApiTokenUseCase(user.identifier, request);
        yield { state: 'ready' as const, ok: true, body: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create API token';
        yield { state: 'ready' as const, ok: false, error: message };
      }
    },
  });
}
