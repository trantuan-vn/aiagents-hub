import { decryptField, encryptField } from '../../../shared/field-encryption';

export async function requireEncryptionSecret(
  getSecret: () => Promise<string | null>,
): Promise<string> {
  const secret = await getSecret();
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not defined in environment variables');
  }
  return secret;
}

export async function encryptPayoutField(plaintext: string, secret: string): Promise<string> {
  return encryptField(plaintext, secret);
}

export async function decryptPayoutField(ciphertext: string, secret: string): Promise<string | null> {
  try {
    return await decryptField(ciphertext, secret);
  } catch {
    return null;
  }
}

export function createPayoutEncryptionSecretGetter(env: Env): () => Promise<string> {
  return () => requireEncryptionSecret(() => env.ENCRYPTION_SECRET.get());
}
