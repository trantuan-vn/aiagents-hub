/** Collected clarifying questions. Not shown to the user until synthesis. */
export const MAX_ASK_QUESTIONS = 8;
const CLIP = 400;

export function clipTrace(value: string, max = CLIP): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function pushAsks(bag: string[], incoming: string[]): string[] {
  const seen = new Set(bag.map((q) => q.trim().toLowerCase()));
  const next = [...bag];
  for (const raw of incoming) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(text);
    if (next.length >= MAX_ASK_QUESTIONS) break;
  }
  return next;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function questionsFromValue(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const rec = value as Record<string, unknown>;
  const direct = [
    ...stringList(rec.questions),
    ...stringList(rec.askUser),
    ...stringList(rec.ask_user),
  ];
  if (direct.length) return direct;
  if (rec.result != null) return questionsFromValue(rec.result);
  return [];
}

export function asksFromOutput(output: unknown): string[] {
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) return [];
    try {
      return questionsFromValue(JSON.parse(trimmed) as unknown);
    } catch {
      return [];
    }
  }
  return questionsFromValue(output);
}

export function asksFromObservations(
  observations: Array<{ tool: string; output?: unknown }>,
): string[] {
  const found: string[] = [];
  for (const observation of observations) {
    const name = observation.tool.toLowerCase();
    if (name !== 'ask_user' && name !== 'codemode' && !name.includes('code_mode')) continue;
    found.push(...asksFromOutput(observation.output));
  }
  return found;
}

/** Tie keeps the earliest question so the fallback is stable. */
export function mostFrequentAsk(asks: string[]): string {
  const counts = new Map<string, { n: number; first: number; text: string }>();
  asks.forEach((raw, index) => {
    const text = raw.trim();
    if (!text) return;
    const key = text.toLowerCase();
    const row = counts.get(key);
    if (!row) counts.set(key, { n: 1, first: index, text });
    else row.n += 1;
  });
  let best = '';
  let bestN = 0;
  let bestFirst = Number.POSITIVE_INFINITY;
  for (const row of counts.values()) {
    if (row.n > bestN || (row.n === bestN && row.first < bestFirst)) {
      best = row.text;
      bestN = row.n;
      bestFirst = row.first;
    }
  }
  return best;
}

export function sandboxErrorFromOutput(output: unknown): string {
  const value = typeof output === 'string' ? safeParse(output) : output;
  if (!value || typeof value !== 'object') return '';
  const rec = value as Record<string, unknown>;
  const nested = rec.result && typeof rec.result === 'object' ? (rec.result as Record<string, unknown>) : rec;
  const error = nested.error ?? rec.error;
  return typeof error === 'string' ? error.trim() : '';
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** One statement, trailing semicolon, no fence. Empty when it is not runnable SQL. */
export function runnableSqlStatement(sql: string): string {
  let text = sql.trim();
  if (!text) return '';
  text = text.replace(/^```sql\s*/i, '').replace(/^```\s*/, '').replace(/```$/g, '').trim();
  if (text.includes(';')) {
    const parts = text.split(';').map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 1) return '';
    text = parts[0] ?? '';
  }
  if (!/^(SELECT|WITH)\b/i.test(text)) return '';
  return `${text};`;
}

export function refusalSentence(userText: string, reason: string): string {
  const vi =
    /[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(userText) ||
    /\b(cho|của|không|tháng|doanh thu|thông tin|liệt kê)\b/i.test(userText);
  const base = vi ? 'Tôi không thể giúp yêu cầu này.' : 'I cannot help with that request.';
  const extra = reason.trim();
  return extra ? `${base} ${extra}` : base;
}

export const ASK_SYNTH_PROMPT = `Write ONE follow-up question the user can answer. Use the same language as the user message. Reply with JSON only: {"question":"..."}
Do not list the gaps. Do not use a fixed English template unless the user wrote in English.`;
