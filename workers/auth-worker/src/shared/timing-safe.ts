/** Constant-time string compare (mitigates timing side-channels on secrets/signatures). */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Hex digest compare (case-insensitive for a). */
export function timingSafeEqualHex(provided: string, expected: string): boolean {
  return timingSafeEqualString(provided.toLowerCase(), expected.toLowerCase());
}
