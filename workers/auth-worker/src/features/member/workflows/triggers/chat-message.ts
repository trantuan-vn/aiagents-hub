/** Matches the support composer. Direct API calls cannot exceed it. */
export const CHAT_INPUT_MAX = 1000;

const CHAT_SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CHAT_ACTION = /^[A-Za-z0-9_-]{1,32}$/;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Strip card numbers and labeled secrets before the model, memory, and logs see the text. */
export function redactChatSecrets(input: string): string {
  const withoutCards = input.replace(/\d[\d -]{11,22}\d/g, (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnOk(digits)) return raw;
    return '[redacted]';
  });
  return withoutCards
    .replace(
      /\b(?:password|passwd|cvv|cvc|pin|mật khẩu|mat khau)\b\s*[:=]\s*\S+/gi,
      (match) => match.replace(/\s*[:=]\s*\S+$/u, ' [redacted]'),
    )
    .replace(/\b(?:otp|mã otp|ma otp)\b\s*(?:is|là|:|=)?\s*\d{4,8}\b/gi, (match) =>
      match.replace(/\d{4,8}$/u, '[redacted]'),
    );
}

export function parseChatMessageRequest(body: Record<string, unknown>): {
  sessionId: string;
  chatInput: string;
  action: string;
  invalidSession: boolean;
  tooLong: boolean;
} {
  const nested =
    body.body && typeof body.body === 'object' && !Array.isArray(body.body)
      ? (body.body as Record<string, unknown>)
      : {};
  const rawInput = String(
    body.chatInput ?? body.message ?? body.query ?? body.text ?? nested.chatInput ?? nested.message ?? '',
  ).trim();
  const tooLong = rawInput.length > CHAT_INPUT_MAX;
  const suppliedSession = String(body.sessionId ?? nested.sessionId ?? '').trim();
  const invalidSession = suppliedSession.length > 0 && !CHAT_SESSION_ID.test(suppliedSession);
  const sessionId = suppliedSession && !invalidSession ? suppliedSession : crypto.randomUUID();
  const rawAction = String(body.action ?? 'sendMessage').trim();
  const action = CHAT_ACTION.test(rawAction) ? rawAction : 'sendMessage';
  return {
    sessionId,
    chatInput: tooLong ? '' : redactChatSecrets(rawInput),
    action,
    invalidSession,
    tooLong,
  };
}
