import { tool } from 'ai';

export const CONFIRM_APPROVE_TOKEN = '__assistant_confirm_ok__';
export const CONFIRM_REQUIRED_TOKEN = '__assistant_confirm_required__';
export const CONFIRM_SEPARATOR = '::';

export const MEMBER_ACTIONS_CONFIRMATION_NOTE = [
  'Some dashboard actions change the account (create, cancel, revoke, refund).',
  'When a tool result has state confirmation-required, summarize that action in plain language and stop.',
  `Append this exact marker on its own line at the end of that summary: ${CONFIRM_REQUIRED_TOKEN}`,
  'Do not say the action succeeded until a later tool result has state ready and ok true.',
  'Return payment URLs exactly as the tool output provides them.',
].join('\n');

/** User-visible layout. The marker stays outside tags so the chat can detect it. */
export const MEMBER_ACTIONS_HTML_NOTE = [
  'The user-visible answer must be an HTML fragment. The first character is "<".',
  'This overrides any instruction to answer in plain text.',
  'Do not wrap it in markdown fences, and do not include html, head, body, script, or style tags.',
  'Inline style attributes are allowed. Use p, h2, h3, ul, ol, li, table, th, td, strong, em, a, div, span, svg, canvas, and pre.',
  'When the answer compares several numbers, a trend, or parts of a whole, include one graphic: an svg, a canvas with data-chart JSON, or a pre with class mermaid. Put one short p before it and one short p after it, and keep the same numbers in a p or table.',
  'A one-line fact is still <p>. Keep the words simple. Keep payment URLs as <a href="..."> links with the exact URL from the tool.',
  `When you must append ${CONFIRM_REQUIRED_TOKEN}, put that marker on its own line after the HTML, not inside a tag. Do not add a chart to that confirmation summary.`,
].join('\n');

export function appendMemberActionsNote(
  system: string,
  tools: Array<{ kind?: unknown }>,
): string {
  if (!tools.some((item) => String(item.kind ?? '') === 'member_actions')) return system;
  const base = system.trim();
  const parts = [MEMBER_ACTIONS_HTML_NOTE, base, MEMBER_ACTIONS_CONFIRMATION_NOTE, MEMBER_ACTIONS_HTML_NOTE];
  return parts.filter(Boolean).join('\n\n');
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`);
  return `{${entries.join(',')}}`;
}

export function buildConfirmationKey(toolName: string, input: Record<string, unknown>): string {
  return `${toolName}:${stableSerialize(input)}`;
}

function extractApprovedConfirmationKey(message: string): string | null {
  const normalized = message
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (normalized === CONFIRM_APPROVE_TOKEN) return '';
  const prefix = `${CONFIRM_APPROVE_TOKEN}${CONFIRM_SEPARATOR}`;
  if (!normalized.startsWith(prefix)) return null;
  return normalized.slice(prefix.length).trim();
}

function hasExplicitUserConfirmation(message: string, expectedKey: string): boolean {
  const approvedKey = extractApprovedConfirmationKey(message);
  if (approvedKey === null) return false;
  if (!approvedKey) return true;
  return approvedKey === expectedKey;
}

export function withUserConfirmation(baseTool: any, latestUserMessageText: string, toolName: string) {
  return tool({
    description: `${baseTool.description}\n\nBefore executing this tool, you must present a short action summary and wait for explicit user confirmation.`,
    inputSchema: baseTool.inputSchema,
    execute: async function* executeWithConfirmation(input: Record<string, unknown>) {
      const parsedInput = baseTool.inputSchema.safeParse(input);
      if (!parsedInput.success) {
        throw new Error(`Invalid tool input: ${parsedInput.error.message}`);
      }

      const confirmationKey = buildConfirmationKey(toolName, parsedInput.data);
      if (!hasExplicitUserConfirmation(latestUserMessageText, confirmationKey)) {
        yield {
          state: 'confirmation-required' as const,
          confirmationKey,
        };
        return;
      }

      yield* baseTool.execute(parsedInput.data);
    },
  });
}
