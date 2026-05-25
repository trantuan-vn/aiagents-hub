import { getOrCreateDeviceId } from "@/lib/device-id";

/** Header gửi kèm mọi request đăng nhập tới auth API. */
export function buildAuthClientHeaders(extra?: Record<string, string>): Record<string, string> {
  const deviceId = getOrCreateDeviceId();
  return {
    "X-Client-Device-Id": deviceId,
    ...extra,
  };
}
