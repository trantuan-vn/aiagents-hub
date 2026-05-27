/**
 * TOTP (RFC 6238) utilities using Web Crypto API.
 * Used for Authenticator app (e.g. Google Authenticator) setup and verification.
 */
import { timingSafeEqualString } from '../../shared/timing-safe';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, message);
}

function uint64Be(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setUint32(4, counter >>> 0, false);
  view.setUint32(0, (counter / 0x1_0000_0000) >>> 0, false);
  return buf;
}

function dynamicTruncate(hash: ArrayBuffer): number {
  const bytes = new Uint8Array(hash);
  const offset = bytes[bytes.length - 1] & 0x0f;
  return (
    ((bytes[offset] & 0x7f) << 24) |
    ((bytes[offset + 1] & 0xff) << 16) |
    ((bytes[offset + 2] & 0xff) << 8) |
    (bytes[offset + 3] & 0xff)
  );
}

/**
 * Generate a new cryptographically random TOTP secret (base32, 20 chars = 16 bytes).
 */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Compute current TOTP code for a given secret (for comparison when user enters code).
 */
export async function getTotpCode(secretBase32: string, timeStep?: number): Promise<string> {
  const counter =
    timeStep ?? Math.floor(Math.floor(Date.now() / 1000) / TOTP_STEP_SECONDS);
  const key = base32Decode(secretBase32);
  const message = uint64Be(counter);
  const hash = await hmacSha1(key, message);
  const otp = dynamicTruncate(hash) % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/** Time step window for verification: ±2 steps (~60s each side) + rate limit on login. */
const TOTP_VERIFY_WINDOW = 2;

/**
 * Verify a 6-digit code against the secret.
 * Allows ±4 time steps (270s window) to tolerate clock skew between server and Authenticator app.
 */
export async function verifyTotpCode(secretBase32: string, code: string): Promise<boolean> {
  const trimmedCode = code.replace(/\D/g, '').slice(0, 6);
  if (trimmedCode.length !== 6) return false;
  const baseStep = Math.floor(Math.floor(Date.now() / 1000) / TOTP_STEP_SECONDS);
  for (let delta = -TOTP_VERIFY_WINDOW; delta <= TOTP_VERIFY_WINDOW; delta++) {
    const expected = await getTotpCode(secretBase32, baseStep + delta);
    if (timingSafeEqualString(expected, trimmedCode)) return true;
  }
  return false;
}

/**
 * Build otpauth URL for QR code (e.g. for Google Authenticator).
 */
export function buildTotpUri(
  secret: string,
  accountName: string,
  issuer: string
): string {
  const encodedAccount = encodeURIComponent(accountName);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}
