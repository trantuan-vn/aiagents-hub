import { DurableObject } from 'cloudflare:workers';

/** Episodic state: summary of last ≤10 messages + raw tail for debugging. */
export type EpisodicSnapshot = {
  episodicSummary: string;
  last10: Array<{ role: string; content: string; at: number }>;
};

const STORAGE_KEY = 'episodic_v1';

/**
 * Per-user Durable Object: short-term episodic memory (summary of last 10 messages).
 * Invoked only from auth-worker via stub.fetch — not exposed publicly.
 */
export class AskAiMemoryDO extends DurableObject {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState, _env: Env) {
    super(state, _env);
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/load' && request.method === 'GET') {
        const raw = await this.storage.get<string>(STORAGE_KEY);
        const data: EpisodicSnapshot = raw
          ? (JSON.parse(raw) as EpisodicSnapshot)
          : { episodicSummary: '', last10: [] };
        return Response.json(data);
      }
      if (url.pathname === '/sync' && request.method === 'POST') {
        const body = (await request.json()) as EpisodicSnapshot;
        if (!body || typeof body.episodicSummary !== 'string' || !Array.isArray(body.last10)) {
          return Response.json({ error: 'invalid body' }, { status: 400 });
        }
        const trimmed = body.last10.slice(-10).map((m) => ({
          role: m.role,
          content: String(m.content ?? '').slice(0, 8000),
          at: typeof m.at === 'number' ? m.at : Date.now(),
        }));
        const snapshot: EpisodicSnapshot = {
          episodicSummary: body.episodicSummary.slice(0, 12000),
          last10: trimmed,
        };
        await this.storage.put(STORAGE_KEY, JSON.stringify(snapshot));
        return Response.json({ ok: true });
      }
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : 'load failed' }, { status: 500 });
    }
    return new Response('Not found', { status: 404 });
  }
}
