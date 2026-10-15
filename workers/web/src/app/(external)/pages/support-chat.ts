export const SUPPORT_CHAT_INPUT_MAX = 1000;
export const SUPPORT_SESSION_STORAGE_KEY = "site-support-session";

const QUICKSTART_AFTER_SIGNUP = "https://aiagents-hub.vn/docs/quickstart";

export const SUPPORT_CTA_ACTIONS = ["signup", "packages", "quickstart", "plans", "credits", "contact"] as const;

export type SupportCta = (typeof SUPPORT_CTA_ACTIONS)[number];

const CTA_LINE = /^__support_cta__ (signup|packages|quickstart|plans|credits|contact)$/;

export function siteSupportChatUrl(): string | null {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || "https://api.aiagents-hub.vn";
  const workflowId = process.env.NEXT_PUBLIC_SITE_SUPPORT_WORKFLOW_ID?.trim();
  if (!workflowId) return null;
  const chatPath = process.env.NEXT_PUBLIC_SITE_SUPPORT_CHAT_PATH?.trim() || "site-support";
  const url = new URL(`${apiBaseUrl}/chat/${encodeURIComponent(workflowId)}/${encodeURIComponent(chatPath)}`);
  const ownerId = process.env.NEXT_PUBLIC_SITE_SUPPORT_OWNER_ID?.trim();
  if (ownerId) url.searchParams.set("owner_id", ownerId);
  url.searchParams.set("format", "json");
  return url.toString();
}

/** Last line `__support_cta__ <action>` becomes a button. Any other ending stays in the bubble. */
export function parseSupportReply(output: string): { text: string; cta: SupportCta | null } {
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  const last = lines.length > 0 ? lines[lines.length - 1]?.trim() ?? "" : "";
  const match = CTA_LINE.exec(last);
  if (!match) return { text: output.trim(), cta: null };
  lines.pop();
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  const action = match[1];
  if (!isSupportCta(action)) return { text: output.trim(), cta: null };
  return { text: lines.join("\n").trim(), cta: action };
}

export function isSupportCta(value: string): value is SupportCta {
  return (SUPPORT_CTA_ACTIONS as readonly string[]).includes(value);
}

export function supportCtaHref(cta: SupportCta): string {
  switch (cta) {
    case "signup":
      return `/auth/v3/login?redirect=${encodeURIComponent(QUICKSTART_AFTER_SIGNUP)}`;
    case "packages":
      return "/packages";
    case "quickstart":
      return "/docs/quickstart";
    case "plans":
      return "/docs/plans";
    case "credits":
      return "/docs/credits";
    case "contact":
      return "/contact";
  }
}

export type CannedSupportKey = "recommend" | "credits" | "how_credits" | "upgrade" | "default";

/** Keyword fallback used when the workflow is unset or the chat route fails. */
export function cannedSupportKey(query: string): CannedSupportKey {
  const lowerQuery = query.toLowerCase();
  if (
    lowerQuery.includes("agent") ||
    lowerQuery.includes("workflow") ||
    lowerQuery.includes("recommend") ||
    lowerQuery.includes("đề xuất") ||
    lowerQuery.includes("xây")
  ) {
    return "recommend";
  }
  if (
    lowerQuery.includes("credit") ||
    lowerQuery.includes("quota") ||
    lowerQuery.includes("calls") ||
    lowerQuery.includes("ví")
  ) {
    return "credits";
  }
  if (
    lowerQuery.includes("rate limit") ||
    lowerQuery.includes("giới hạn") ||
    lowerQuery.includes("how credit") ||
    lowerQuery.includes("credit work")
  ) {
    return "how_credits";
  }
  if (
    lowerQuery.includes("upgrade") ||
    lowerQuery.includes("plan") ||
    lowerQuery.includes("gói") ||
    lowerQuery.includes("nâng cấp") ||
    lowerQuery.includes("cancel") ||
    lowerQuery.includes("hủy")
  ) {
    return "upgrade";
  }
  return "default";
}

export class SupportChatError extends Error {
  readonly status: number;
  readonly requiresCaptcha: boolean;
  readonly siteKey: string | null;

  constructor(
    message: string,
    status: number,
    extra?: { requiresCaptcha?: boolean; siteKey?: string | null },
  ) {
    super(message);
    this.name = "SupportChatError";
    this.status = status;
    this.requiresCaptcha = Boolean(extra?.requiresCaptcha);
    this.siteKey = extra?.siteKey ?? null;
  }
}

export async function postSiteSupportChat(params: {
  endpointUrl: string;
  sessionId: string;
  chatInput: string;
  turnstileToken?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch(params.endpointUrl, {
    method: "POST",
    credentials: "omit",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sendMessage",
      sessionId: params.sessionId,
      chatInput: params.chatInput,
      ...(params.turnstileToken ? { turnstileToken: params.turnstileToken } : {}),
    }),
    signal: params.signal,
  });
  const body = (await response.json().catch(() => ({}))) as {
    output?: unknown;
    error?: unknown;
    requiresCaptcha?: unknown;
    siteKey?: unknown;
  };
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "Chat workflow failed";
    throw new SupportChatError(message, response.status, {
      requiresCaptcha: body.requiresCaptcha === true,
      siteKey: typeof body.siteKey === "string" ? body.siteKey : null,
    });
  }
  return typeof body.output === "string" ? body.output : "";
}
