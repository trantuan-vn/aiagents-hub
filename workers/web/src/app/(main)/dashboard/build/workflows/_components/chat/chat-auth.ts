export type ChatAuthMode = "basic" | "hub_users";

export type ChatAuthChallenge = {
  auth: ChatAuthMode;
  loginUrl?: string;
};

export function parseChatAuthChallenge(
  status: number,
  data: Record<string, unknown>,
): ChatAuthChallenge | null {
  if (status !== 401) return null;
  const raw = String(data.auth ?? "");
  if (raw === "hub_users" || raw === "basic") {
    return {
      auth: raw,
      loginUrl: typeof data.loginUrl === "string" ? data.loginUrl : undefined,
    };
  }
  return { auth: "basic" };
}

export function isChatMetaPayload(data: Record<string, unknown>): boolean {
  return data.ok === true || typeof data.chatUrl === "string" || typeof data.title === "string";
}

export function hubChatLoginHref(loginUrl?: string): string {
  if (loginUrl) return loginUrl;
  if (typeof window === "undefined") return "/auth/v3/login";
  const returnTo = new URL(window.location.href);
  returnTo.searchParams.set("hub_auth", "1");
  return `/auth/v3/login?redirect=${encodeURIComponent(returnTo.toString())}`;
}

export function isHubAuthReturn(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("hub_auth") === "1";
}

export async function postChatBasicLogin(
  endpointUrl: string,
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    credentials: "include",
    body: new URLSearchParams({
      _form_auth: "login",
      username,
      password,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, error: String(data.error ?? "Invalid username or password") };
  }
  return { ok: true };
}
