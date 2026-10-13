import { getOrCreateDeviceId } from "@/lib/device-id";

/** Header gửi kèm mọi request đăng nhập tới auth API. */
export function buildAuthClientHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const deviceId = getOrCreateDeviceId();
  if (deviceId) headers["X-Client-Device-Id"] = deviceId;
  return headers;
}
