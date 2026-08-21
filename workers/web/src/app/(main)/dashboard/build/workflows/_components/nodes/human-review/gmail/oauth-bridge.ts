/** Same-origin bridge for Gmail OAuth popup → opener (survives Google COOP). */

export const GMAIL_OAUTH_MSG_TYPE = "aiagents-hub:gmail-oauth";
export const GMAIL_OAUTH_STORAGE_KEY = "aiagents-hub:gmail-oauth-result";
export const GMAIL_OAUTH_CHANNEL = "aiagents-hub-gmail-oauth";

export type GmailOAuthResultMessage = {
  type: typeof GMAIL_OAUTH_MSG_TYPE;
  ok: boolean;
  credentialKey?: string;
  name?: string;
  email?: string;
  error?: string;
  ts?: number;
};

export function isGmailOAuthResultMessage(data: unknown): data is GmailOAuthResultMessage {
  return (
    !!data &&
    typeof data === "object" &&
    (data as GmailOAuthResultMessage).type === GMAIL_OAUTH_MSG_TYPE
  );
}

export function publishGmailOAuthResult(msg: Omit<GmailOAuthResultMessage, "type" | "ts">) {
  const full: GmailOAuthResultMessage = {
    type: GMAIL_OAUTH_MSG_TYPE,
    ts: Date.now(),
    ...msg,
  };

  try {
    localStorage.setItem(GMAIL_OAUTH_STORAGE_KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }

  try {
    const bc = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
    bc.postMessage(full);
    bc.close();
  } catch {
    /* ignore */
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(full, window.location.origin);
      window.opener.postMessage(full, "*");
    }
  } catch {
    /* ignore */
  }

  return full;
}

export function readGmailOAuthResultFromStorage(): GmailOAuthResultMessage | null {
  try {
    const raw = localStorage.getItem(GMAIL_OAUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GmailOAuthResultMessage;
    if (!isGmailOAuthResultMessage(parsed)) return null;
    // Ignore stale results older than 5 minutes.
    if (parsed.ts && Date.now() - parsed.ts > 5 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearGmailOAuthResultStorage() {
  try {
    localStorage.removeItem(GMAIL_OAUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
