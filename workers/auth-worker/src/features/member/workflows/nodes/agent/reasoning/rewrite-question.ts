import { REASONING_AGENT_SYSTEM_PROMPT } from '@aiagents-hub/workflow-nodes';

const REWRITE_RULES = `Rewrite the user question so it can retrieve schema and SQL examples.
Return only the rewritten question. Do not answer. Do not write SQL. No markdown.
Rules:
- One sentence, or a few clauses, covering the metric, grouping, filters, and period already in the question.
- Use the domain terms from the system prompt in the user message.
- Do not add table or column names that the system prompt does not name.
- Do not answer the question.`;

export const REWRITE_QUESTION_SYSTEM = REWRITE_RULES;

function normalizePrompt(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

/** Empty, or exactly the Reasoning Agent default, means there is no domain vocabulary to apply. */
export function shouldRewriteForRetrieval(systemPrompt: unknown): boolean {
  const text = normalizePrompt(String(systemPrompt ?? ''));
  if (!text) return false;
  return text !== normalizePrompt(REASONING_AGENT_SYSTEM_PROMPT);
}

export function rewriteQuestionUser(question: string, systemPrompt: string): string {
  return `Question:\n${question.trim()}\n\nSystem prompt:\n${systemPrompt.trim()}`;
}

/** Drop fences and a wrapping quote. Reject SQL, empty text, and anything over 2000 characters. */
export function cleanRewrittenQuestion(raw: string): string {
  let text = String(raw ?? '').trim();
  text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('“') && text.endsWith('”'))
  ) {
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^(question|câu hỏi)\s*:\s*/i, '').trim();
  if (!text || text.length > 2000) return '';
  if (/^\s*(select|with)\b/i.test(text)) return '';
  return text;
}

/** A bad rewrite keeps the original question. The turn does not fail. */
export function acceptRewrittenQuestion(raw: string, original: string): string {
  return cleanRewrittenQuestion(raw) || original.trim();
}
