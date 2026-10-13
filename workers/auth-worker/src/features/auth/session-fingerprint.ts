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
 * Quốc gia login chưa từng thấy trên các thiết bị đã ghi nhận (còn trong KV).
 * Khi chưa có bản ghi nào, phiên active là tín hiệu bổ sung.
 * `XX` / `T1` / rỗng không tính là quốc gia mới.
 */
export function isNovelLoginCountry(
  currentCountry: string | undefined,
  activeSessions: Array<{ country?: string }>,
  recognizedCountries?: Array<string | null | undefined>,
): boolean {
  const current = normalizeLoginCountry(currentCountry);
  if (!current) return false;

  const fromDevices = (recognizedCountries ?? [])
    .map((c) => normalizeLoginCountry(c ?? undefined))
    .filter((c): c is string => !!c);

  const known = new Set<string>();
  if (fromDevices.length > 0) {
    for (const c of fromDevices) known.add(c);
  } else {
    for (const s of activeSessions) {
      const c = normalizeLoginCountry(s.country);
      if (c) known.add(c);
    }
  }
  if (known.size === 0) return false;
  return !known.has(current);
}

const BROWSER_LABELS: Record<string, string> = {
  safari: 'Safari',
  edge: 'Edge',
  chrome: 'Chrome',
  firefox: 'Firefox',
  opera: 'Opera',
  other: 'Browser',
};

const OS_LABELS: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  ios: 'iOS',
  android: 'Android',
  linux: 'Linux',
  other: 'Unknown',
};

/** Nhãn mail từ fingerprint `browser|os`, không đưa nguyên User-Agent. */
export function formatDeviceLabel(userAgent: string, language: 'vi' | 'en' = 'vi'): string {
  const fp = normalizeUaFingerprint(userAgent);
  if (!fp.includes('|')) {
    return language === 'en' ? 'Unknown device' : 'Thiết bị không xác định';
  }
  const [browser, os] = fp.split('|');
  const b = BROWSER_LABELS[browser] ?? 'Browser';
  const o = OS_LABELS[os] ?? 'Unknown';
  return language === 'en' ? `${b} on ${o}` : `${b} trên ${o}`;
}

/** Giờ đăng nhập cố định múi Asia/Ho_Chi_Minh, ví dụ `16:47 8/10/2026 GMT+7`. */
export function formatLoginTimeGmt7(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = pick('hour');
  const minute = pick('minute');
  const day = String(Number(pick('day')));
  const month = String(Number(pick('month')));
  const year = pick('year');
  return `${hour}:${minute} ${day}/${month}/${year} GMT+7`;
}
