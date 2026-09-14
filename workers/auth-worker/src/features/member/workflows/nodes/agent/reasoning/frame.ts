import type { ClarificationMode, TaskFrame } from './types.js';

export function emptyFrame(goal: string): TaskFrame {
  return {
    goal,
    knownFacts: [],
    missingSlots: [],
    confidence: 0.5,
    canUseTools: false,
  };
}

export function inferMissingSlots(
  userText: string,
  context: { hasTools: boolean; hasMemorySnippets: boolean; sessionSummary: string },
): string[] {
  const text = userText.trim();
  if (!text) return ['user_request'];
  if (/\b(TODO|TBD|\?\?\?)\b/i.test(text)) return ['clarification'];

  const greeting = /^(hi|hello|hey|xin chào|chào)\b/i.test(text);
  if (greeting && text.length < 24) return [];

  if (
    /\b(this|that|it|them|đó|cái này)\b/i.test(text) &&
    !context.sessionSummary.trim() &&
    !context.hasMemorySnippets &&
    text.length < 80
  ) {
    return ['referent'];
  }

  const looksLikeDataQuestion =
    /\b(sql|query|schema|table|how many|doanh thu|select)\b/i.test(text) ||
    /[?？]$/.test(text);
  if (looksLikeDataQuestion && !context.hasTools && !context.hasMemorySnippets && text.length < 40) {
    return ['target'];
  }

  return [];
}

export function shouldAskClarification(
  frame: TaskFrame,
  mode: ClarificationMode,
): boolean {
  if (mode !== 'ask') return false;
  if (frame.canUseTools && frame.missingSlots.length > 0) return false;
  return frame.missingSlots.length > 0;
}

export function parseTaskFrame(raw: Record<string, unknown> | null, fallbackGoal: string): TaskFrame {
  if (!raw) return emptyFrame(fallbackGoal);
  const missing = Array.isArray(raw.missingSlots)
    ? raw.missingSlots.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const known = Array.isArray(raw.knownFacts)
    ? raw.knownFacts.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const confidence = Number(raw.confidence);
  return {
    goal: String(raw.goal ?? fallbackGoal).trim() || fallbackGoal,
    knownFacts: known,
    missingSlots: missing,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    canUseTools: Boolean(raw.canUseTools),
  };
}

export const FRAME_PROMPT = `Given the user message and available context, reply with JSON only:
{"goal":"","knownFacts":[],"missingSlots":[],"confidence":0.0,"canUseTools":false}
missingSlots lists information you still need that tools cannot fetch. Use an empty array if you can answer or a tool can fill the gap.`;
