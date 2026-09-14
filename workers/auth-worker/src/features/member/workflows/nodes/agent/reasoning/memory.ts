import { executeUtils } from '../../../../../../shared/utils.js';
import type { UserDO } from '../../../../../ws/infrastructure/UserDO.js';
import {
  embedText,
  matchesToSnippets,
  queryCollection,
  upsertVectors,
} from '../../../rag/index.js';
import { MAX_EPISODES } from './types.js';

export type Episode = {
  at: number;
  summary: string;
  status: string;
};

export type SessionMemory = {
  memoryKey: string;
  summary: string;
  episodes: Episode[];
};

export function memoryKey(workflowId: number, sessionId: string, agentId: string): string {
  return `${workflowId}:${sessionId || 'default'}:${agentId}`;
}

export function resolveSessionId(input: Record<string, unknown>, fallback = ''): string {
  const body = input.body;
  const nested =
    body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const raw =
    input.sessionId ??
    nested.sessionId ??
    input.session_id ??
    fallback;
  const value = String(raw ?? '').trim();
  return value.slice(0, 80);
}

function parseEpisodes(raw: unknown): Episode[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((row) => row && typeof row === 'object')
      .map((row) => {
        const item = row as Record<string, unknown>;
        return {
          at: Number(item.at) || Date.now(),
          summary: String(item.summary ?? '').slice(0, 500),
          status: String(item.status ?? 'ok'),
        };
      });
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parseEpisodes(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export async function loadSessionMemory(
  userDO: DurableObjectStub<UserDO> | undefined,
  key: string,
): Promise<SessionMemory> {
  if (!userDO || !key || typeof userDO.fetch !== 'function') {
    return { memoryKey: key, summary: '', episodes: [] };
  }
  try {
    const rows = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'memoryKey', operator: '=', value: key }, limit: 1 },
      'agent_session_memory',
    );
    const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
    if (!row) return { memoryKey: key, summary: '', episodes: [] };
    return {
      memoryKey: key,
      summary: String(row.summary ?? ''),
      episodes: parseEpisodes(row.episodes),
    };
  } catch (e) {
    console.warn('[reasoning-agent] load session memory failed:', e);
    return { memoryKey: key, summary: '', episodes: [] };
  }
}

export async function saveSessionMemory(
  userDO: DurableObjectStub<UserDO> | undefined,
  args: {
    workflowId: number;
    sessionId: string;
    agentId: string;
    summary: string;
    status: string;
  },
): Promise<void> {
  if (!userDO || typeof userDO.fetch !== 'function') return;
  const key = memoryKey(args.workflowId, args.sessionId, args.agentId);
  const existing = await loadSessionMemory(userDO, key);
  const episode: Episode = {
    at: Date.now(),
    summary: args.summary.slice(0, 500),
    status: args.status,
  };
  const episodes = [...existing.episodes, episode].slice(-MAX_EPISODES);
  const summary = episodes
    .slice(-5)
    .map((e) => e.summary)
    .filter(Boolean)
    .join(' | ')
    .slice(0, 1500);
  const payload = {
    memoryKey: key,
    workflowId: args.workflowId,
    sessionId: args.sessionId || 'default',
    agentId: args.agentId,
    summary,
    episodes: JSON.stringify(episodes),
    updatedAt: Date.now(),
  };
  try {
    if (existing.summary || existing.episodes.length) {
      const rows = await executeUtils.executeDynamicAction(
        userDO,
        'select',
        { where: { field: 'memoryKey', operator: '=', value: key }, limit: 1 },
        'agent_session_memory',
      );
      const row = (Array.isArray(rows) ? rows[0] : rows) as { id?: number } | undefined;
      if (row?.id) {
        await executeUtils.executeDynamicAction(userDO, 'update', { id: row.id, ...payload }, 'agent_session_memory');
        return;
      }
    }
    await executeUtils.executeDynamicAction(userDO, 'insert', payload, 'agent_session_memory');
  } catch (e) {
    console.warn('[reasoning-agent] save session memory failed:', e);
  }
}

export async function retrieveSemanticMemory(
  env: Env,
  collection: string,
  query: string,
  topK = 5,
  namespace?: string,
): Promise<string[]> {
  if (!query.trim() || !collection.trim()) return [];
  try {
    const vector = await embedText(env, query);
    if (!vector.length) return [];
    const matches = await queryCollection(env, collection, vector, { topK, namespace });
    return matchesToSnippets(matches);
  } catch (e) {
    console.warn('[reasoning-agent] semantic retrieve failed:', e);
    return [];
  }
}

export async function persistSemanticEpisode(
  env: Env,
  collection: string,
  text: string,
  namespace?: string,
): Promise<void> {
  const content = text.trim();
  if (!content || !collection.trim()) return;
  try {
    const values = await embedText(env, content);
    if (!values.length) return;
    const id = `episode:${Date.now().toString(36)}:${content.slice(0, 12)}`.slice(0, 64);
    await upsertVectors(env, collection, [
      {
        id,
        values,
        namespace,
        metadata: { text: content.slice(0, 800), source: 'session', docType: 'episode' },
      },
    ]);
  } catch (e) {
    console.warn('[reasoning-agent] persist semantic episode failed:', e);
  }
}
