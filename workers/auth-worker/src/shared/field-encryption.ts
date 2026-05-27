import CryptoJS from 'crypto-js';

const V1_PREFIX = 'v1:';

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** AES-256-GCM; format `v1:{base64(iv||ciphertext+tag)}`. */
export async function encryptField(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `${V1_PREFIX}${bytesToBase64(combined)}`;
}

export async function decryptField(ciphertext: string, secret: string): Promise<string> {
  if (ciphertext.startsWith(V1_PREFIX)) {
    const raw = base64ToBytes(ciphertext.slice(V1_PREFIX.length));
    if (raw.length < 13) throw new Error('Invalid encrypted field');
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const key = await deriveAesKey(secret);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  }

  const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
  const legacy = bytes.toString(CryptoJS.enc.Utf8);
  if (!legacy) throw new Error('Failed to decrypt field');
  return legacy;
}
