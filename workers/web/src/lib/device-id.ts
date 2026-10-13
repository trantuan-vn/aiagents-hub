const STORAGE_KEY = "aiagents_client_device_id";
const DEVICE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateUuidV4(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isDeviceId(value: string | null | undefined): value is string {
  return !!value && DEVICE_ID_RE.test(value.trim());
}

function readWebDeviceCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== "client_device_id") continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return rest.join("=");
    }
  }
  return null;
}

function writeWebDeviceCookie(id: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `client_device_id=${id}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

/**
 * UUID ổn định trên trình duyệt. SSR không sinh id.
 * Thứ tự: localStorage, cookie origin web, rồi UUID mới ghi cả hai.
 */
export function getOrCreateDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isDeviceId(stored)) return stored.trim().toLowerCase();

    const fromCookie = readWebDeviceCookie();
    if (isDeviceId(fromCookie)) {
      const id = fromCookie.trim().toLowerCase();
      localStorage.setItem(STORAGE_KEY, id);
      return id;
    }

    const id = generateUuidV4().toLowerCase();
    localStorage.setItem(STORAGE_KEY, id);
    writeWebDeviceCookie(id);
    return id;
  } catch {
    return null;
  }
}
