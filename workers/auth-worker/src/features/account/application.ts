import { Context } from 'hono';
import { getIdFromName } from '../../shared/utils';
import { UserDO } from '../ws/infrastructure/UserDO';
import { createRepository } from '../auth/infrastructure';
import { requireAuth } from '../auth/authMiddleware';

export interface IAccountApplicationService {
  listSessionsUseCase(identifier: string, currentSessionId: string | undefined): Promise<{ sessions: any[] }>;
  revokeSessionUseCase(identifier: string, sessionId: string): Promise<void>;
}

export function createAccountApplicationService(c: Context, bindingName: string): IAccountApplicationService {
  const getRepository = (identifier: string) => {
    const userDO = getIdFromName(c, identifier, bindingName) as DurableObjectStub<UserDO>;
    if (!userDO) throw new Error('User not found');
    return createRepository(userDO);
  };

  return {
    async listSessionsUseCase(identifier: string, currentSessionId: string | undefined) {
      const repo = getRepository(identifier);
      const list = await repo.sessions.listAll(50);
      const sessions = list.map((s: any) => ({
        id: s.id,
        hashSessionId: s.hashSessionId,
        type: s.type ?? 'unknown',
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        expiresAt: s.expiresAt,
        isActive: !!s.isActive,
        isCurrent: currentSessionId ? s.hashSessionId === currentSessionId : false,
      }));
      return { sessions };
    },

    async revokeSessionUseCase(identifier: string, sessionId: string) {
      const repo = getRepository(identifier);
      const session = await repo.sessions.findById(sessionId);
      if (!session) throw new Error('Session not found');
      await repo.sessions.update(sessionId, { isActive: false });
    },
  };
}
