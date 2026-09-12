const STORAGE_KEY = "aiagents_last_login_email";
const COOKIE_NAME = "last_login_email";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cookieDomainSuffix(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return "";
  if (host.endsWith("aiagents-hub.vn")) return "; domain=.aiagents-hub.vn";
  return "";
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Email đăng nhập thành công gần nhất — dùng để prefill form login. */
export function readLastLoginEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromStorage = window.localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    if (isEmail(fromStorage)) return fromStorage;
  } catch {
    /* private mode */
  }
  const fromCookie = readCookie(COOKIE_NAME).trim();
  return isEmail(fromCookie) ? fromCookie : "";
}

export function writeLastLoginEmail(identifier: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const trimmed = identifier?.trim() ?? "";
  if (!isEmail(trimmed)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* private mode / quota */
  }
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(trimmed)}; path=/${cookieDomainSuffix()}; max-age=${COOKIE_MAX_AGE}${secure}; samesite=lax`;
}
