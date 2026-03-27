import type { EpisodicSnapshot } from './AskAiMemoryDO';

export async function loadEpisodic(env: Env, userId: string): Promise<EpisodicSnapshot> {
  const ns = env.ASK_AI_MEMORY_DO;
  if (!ns) return { episodicSummary: '', last10: [] };
  const stub = ns.get(ns.idFromName(userId));
  const res = await stub.fetch('https://ask-ai-memory/load');
  if (!res.ok) return { episodicSummary: '', last10: [] };
  return (await res.json()) as EpisodicSnapshot;
}

export async function persistEpisodic(env: Env, userId: string, snap: EpisodicSnapshot): Promise<void> {
  const ns = env.ASK_AI_MEMORY_DO;
  if (!ns) return;
  const stub = ns.get(ns.idFromName(userId));
  await stub.fetch('https://ask-ai-memory/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snap),
  });
}

export async function summarizeLast10Messages(ai: Ai, lines: Array<{ role: string; content: string }>): Promise<string> {
  if (lines.length === 0) return '';
  const transcript = lines.map((m) => `${m.role}: ${m.content}`).join('\n');
  const r = await ai.run(
    '@cf/meta/llama-3.1-8b-instruct-fp8',
    {
      messages: [
        {
          role: 'system',
          content:
            'Tóm tắt tối đa 10 tin nhắn sau bằng tiếng Việt, súc tích (5–10 câu), giữ chi tiết quan trọng cho ngữ cảnh hội thoại tiếp theo.',
        },
        { role: 'user', content: transcript.slice(0, 12000) },
      ],
      max_tokens: 500,
    },
    { gateway: { id: 'unitoken' } },
  );
  const raw = (r as { response?: string })?.response ?? '';
  return raw.trim() || '';
}
