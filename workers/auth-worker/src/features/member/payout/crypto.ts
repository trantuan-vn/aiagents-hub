import CryptoJS from 'crypto-js';

export async function requireEncryptionSecret(
  getSecret: () => Promise<string | null>,
): Promise<string> {
  const secret = await getSecret();
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
  }
  return secret;
}

export function encryptPayoutField(plaintext: string, secret: string): string {
  return CryptoJS.AES.encrypt(plaintext, secret).toString();
}

export function decryptPayoutField(ciphertext: string, secret: string): string | null {
  const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
  const decrypted = bytes.toString(CryptoJS.enc.Utf8);
  return decrypted || null;
}

export function createPayoutEncryptionSecretGetter(env: Env): () => Promise<string> {
  return () => requireEncryptionSecret(() => env.ENCRYPTION_SECRET.get());
}
