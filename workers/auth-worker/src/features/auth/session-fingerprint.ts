/**
 * Chuẩn hóa IP/UA để so sánh "cùng thiết bị/mạng" — tránh false positive khi IP mobile đổi
 * hoặc UA chỉ khác version patch.
 */

function firstIp(ip: string): string {
  return ip.split(',')[0]?.trim() ?? ip;
}

/** IPv4: /24; IPv6: 4 nhóm đầu (~/48). */
export function normalizeIpFingerprint(ip: string): string {
  const trimmed = firstIp(ip);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
    const parts = trimmed.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter((p) => p.length > 0);
    return parts.slice(0, 4).join(':').toLowerCase();
  }
  return trimmed.toLowerCase();
}

/** Browser family + OS — bỏ version string. */
export function normalizeUaFingerprint(ua: string): string {
  const u = (ua || '').trim();
  if (!u || u === 'apiToken') return u;

  let os = 'other';
  if (/iPhone|iPad|iPod/i.test(u)) os = 'ios';
  else if (/Android/i.test(u)) os = 'android';
  else if (/Windows/i.test(u)) os = 'windows';
  else if (/Mac OS X|Macintosh/i.test(u)) os = 'macos';
  else if (/Linux/i.test(u)) os = 'linux';

  let browser = 'other';
  if (/Edg\//i.test(u)) browser = 'edge';
  else if (/OPR\/|Opera/i.test(u)) browser = 'opera';
  else if (/Chrome\//i.test(u) && !/Edg/i.test(u)) browser = 'chrome';
  else if (/Safari\//i.test(u) && !/Chrome/i.test(u)) browser = 'safari';
  else if (/Firefox\//i.test(u)) browser = 'firefox';

  return `${browser}|${os}`;
}

export function ipFingerprintsMatch(a: string, b: string): boolean {
  return normalizeIpFingerprint(a) === normalizeIpFingerprint(b);
}

export function uaFingerprintsMatch(a: string, b: string): boolean {
  return normalizeUaFingerprint(a) === normalizeUaFingerprint(b);
}

/** Cùng ngữ cảnh thiết bị nếu IP subnet và browser/OS family trùng. */
export function sessionContextsMatch(
  ipA: string,
  uaA: string,
  ipB: string,
  uaB: string,
): boolean {
  return ipFingerprintsMatch(ipA, ipB) && uaFingerprintsMatch(uaA, uaB);
}

/**
 * Fingerprint cho email/cooldown "thiết bị mới" — chỉ browser/OS, không gắn IP.
 * IP nhà mạng/4G hay đổi subnet; UA family (safari|ios, chrome|macos) ổn định hơn trên cùng máy.
 */
export function newSessionDeviceFingerprint(_ipAddress: string, userAgent: string): string {
  return normalizeUaFingerprint(userAgent);
}

const UNKNOWN_COUNTRY_CODES = new Set(['XX', 'T1']);

/** Mã quốc gia ISO2 từ CF; null nếu không đủ tin cậy. */
export function normalizeLoginCountry(country?: string): string | null {
  const c = (country ?? '').trim().toUpperCase();
  if (c.length !== 2 || UNKNOWN_COUNTRY_CODES.has(c)) return null;
  return c;
}

/**
 * Quốc gia login hiện tại chưa từng thấy trên phiên active → rủi ro geo (VPN/du lịch/tấn công).
 * Dùng để vẫn gửi email dù cùng browser|os (bù giả UA).
 */
export function isNovelLoginCountry(
  currentCountry: string | undefined,
  activeSessions: Array<{ country?: string }>,
): boolean {
  const current = normalizeLoginCountry(currentCountry);
  if (!current) return false;

  const known = new Set<string>();
  for (const s of activeSessions) {
    const c = normalizeLoginCountry(s.country);
    if (c) known.add(c);
  }
  if (known.size === 0) return false;
  return !known.has(current);
}
