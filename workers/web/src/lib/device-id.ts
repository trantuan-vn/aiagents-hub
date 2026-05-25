const STORAGE_KEY = "aiagents_client_device_id";

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

/** UUID v4 ổn định trên trình duyệt — dùng cho nhận diện thiết bị khi login. */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return generateUuidV4();
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = generateUuidV4();
    localStorage.setItem(STORAGE_KEY, id);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `client_device_id=${id}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    return id;
  } catch {
    return generateUuidV4();
  }
}
