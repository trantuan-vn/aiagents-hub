import type { AgentCitation, ToolObservation } from './types.js';

export function parseCitationIds(text: string): number[] {
  const ids = new Set<number>();
  const re = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n > 0) ids.add(n);
  }
  return [...ids].sort((a, b) => a - b);
}

export function buildCitations(args: {
  snippets: string[];
  observations: ToolObservation[];
  sessionSummary?: string;
}): AgentCitation[] {
  const citations: AgentCitation[] = [];
  let id = 1;
  for (const snippet of args.snippets) {
    const text = snippet.trim();
    if (!text) continue;
    citations.push({ id: id++, source: 'memory', snippet: text.slice(0, 500) });
  }
  for (const obs of args.observations) {
    const snippet = String(obs.output ?? '').trim();
    if (!snippet) continue;
    citations.push({
      id: id++,
      source: `tool:${obs.tool}`,
      snippet: snippet.slice(0, 500),
      tool: obs.tool,
    });
  }
  const session = args.sessionSummary?.trim();
  if (session) {
    citations.push({ id: id++, source: 'session', snippet: session.slice(0, 500) });
  }
  return citations;
}

export function formatCitationBlock(citations: AgentCitation[]): string {
  if (!citations.length) return '';
  return citations.map((c) => `[${c.id}] (${c.source}) ${c.snippet}`).join('\n');
}

export function claimsNeedCitations(text: string, requireCitations: boolean): boolean {
  if (!requireCitations) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length < 40 && /[?？]$/.test(trimmed)) return false;
  if (/^(i (don't|do not) know|tôi không)/i.test(trimmed)) return false;
  return parseCitationIds(trimmed).length === 0;
}

export function groundedTextOrFallback(text: string, citations: AgentCitation[]): string {
  const body = String(text ?? '');
  if (!citations.length) return body;
  if (parseCitationIds(body).length) return body;
  return `${body.trim()}\n\nSources: ${citations.map((c) => `[${c.id}]`).join(' ')}`;
}
