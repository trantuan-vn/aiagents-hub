import { runnableSqlStatement } from '../nodes/agent/reasoning/ask-bag.js';

function looksLikeJsonBlob(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function sqlInString(text: string): string {
  const direct = runnableSqlStatement(text);
  if (direct) return direct;
  const fenced = text.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fromFence = runnableSqlStatement(fenced[1]);
    if (fromFence) return fromFence;
  }
  const select = text.match(/\b((?:WITH|SELECT)\b[\s\S]{8,12000}?)(?:;|$)/i);
  if (select?.[1]) {
    const fromBody = runnableSqlStatement(select[1]);
    if (fromBody) return fromBody;
  }
  return '';
}

/** Pull one runnable SELECT/WITH from a node output, including HTTP echo `body.sql`. */
export function findRunnableSql(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') {
    const direct = sqlInString(value);
    if (direct) return direct;
    if (!looksLikeJsonBlob(value)) return '';
    try {
      return findRunnableSql(JSON.parse(value) as unknown, depth + 1);
    } catch {
      return '';
    }
  }
  if (typeof value !== 'object') return '';
  const rec = value as Record<string, unknown>;
  for (const key of ['sql', 'artifact', 'body', 'data', 'result', 'text']) {
    const found = findRunnableSql(rec[key], depth + 1);
    if (found) return found;
  }
  return '';
}

function isChatTriggerEcho(rec: Record<string, unknown>): boolean {
  if (rec.triggerKind !== 'chat' && rec.action !== 'sendMessage') return false;
  const userText = typeof rec.chatInput === 'string' ? rec.chatInput : '';
  const replyFields = [rec.output, rec.message, rec.response, rec.reply, rec.text];
  return !replyFields.some((value) => typeof value === 'string' && value.trim() && value !== userText);
}

function isHttpEcho(rec: Record<string, unknown>): boolean {
  return rec.echo === true || (rec.local === true && typeof rec.method === 'string');
}

function reasoningReply(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const rec = value as Record<string, unknown>;
  if (isHttpEcho(rec)) return undefined;
  if (rec.status !== 'ok' && rec.status !== 'needs_clarification' && rec.status !== 'refused') return undefined;
  if (rec.status === 'needs_clarification' || rec.status === 'refused') {
    if (typeof rec.text === 'string' && rec.text.trim() && !looksLikeJsonBlob(rec.text)) return rec.text.trim();
  }
  if (rec.status === 'ok') {
    const sql = findRunnableSql(rec);
    if (sql) return sql;
    if (typeof rec.text === 'string' && rec.text.trim() && !looksLikeJsonBlob(rec.text)) return rec.text.trim();
  }
  return '';
}

function textFromUnknown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const rec = value as Record<string, unknown>;
  const bubble = reasoningReply(value);
  if (bubble !== undefined) return bubble;
  if (isChatTriggerEcho(rec) || isHttpEcho(rec)) return '';
  const userText = typeof rec.chatInput === 'string' ? rec.chatInput : '';
  const candidates = [rec.output, rec.text, rec.message, rec.response, rec.reply];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && candidate !== userText && !looksLikeJsonBlob(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = textFromUnknown(candidate);
      if (nested && !looksLikeJsonBlob(nested)) return nested;
    }
  }
  return '';
}

export function extractChatReply(result: { output?: unknown; steps?: Array<{ output?: unknown }> }): string {
  const blobs: unknown[] = [...(result.steps ?? []).map((step) => step?.output), result.output];
  for (let i = blobs.length - 1; i >= 0; i -= 1) {
    const reply = reasoningReply(blobs[i]);
    if (reply) return reply;
  }
  for (let i = blobs.length - 1; i >= 0; i -= 1) {
    const sql = findRunnableSql(blobs[i]);
    if (sql) return sql;
  }
  const fromOutput = textFromUnknown(result.output);
  if (fromOutput) return fromOutput;
  const steps = result.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const text = textFromUnknown(steps[i]?.output);
    if (text) return text;
  }
  return '';
}
