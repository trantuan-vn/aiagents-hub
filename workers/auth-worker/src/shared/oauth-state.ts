import { timingSafeEqualHex } from './timing-safe';

type OAuthStatePayload = { s: string; n: string };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encodeOAuthState(
  sessionId: string,
  nonce: string,
  signingSecret: string,
): Promise<string> {
  const payload = JSON.stringify({ s: sessionId, n: nonce } satisfies OAuthStatePayload);
  const payloadPart = base64UrlEncode(new TextEncoder().encode(payload));
  const sig = await hmacSha256Hex(signingSecret, payloadPart);
  return `${payloadPart}.${sig}`;
}

export async function decodeOAuthState(
  state: string,
  signingSecret: string,
): Promise<{ sessionId: string; nonce: string } | null> {
  const trimmed = state.trim();
  if (!trimmed) return null;

  const dot = trimmed.lastIndexOf('.');
  if (dot > 0) {
    const payloadPart = trimmed.slice(0, dot);
    const sig = trimmed.slice(dot + 1);
    if (!payloadPart || !sig) return null;
    const expected = await hmacSha256Hex(signingSecret, payloadPart);
    if (!timingSafeEqualHex(sig, expected)) return null;
    try {
      const json = new TextDecoder().decode(base64UrlDecode(payloadPart));
      const p = JSON.parse(json) as OAuthStatePayload;
      if (p?.s && p?.n) return { sessionId: p.s, nonce: p.n };
    } catch {
      return null;
    }
    return null;
  }

  return null;
}
