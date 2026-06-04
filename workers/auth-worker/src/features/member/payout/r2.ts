const PAYPAL_QR_PREFIX = 'payout-paypal-qr';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

export function validatePaypalQrImage(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Invalid file type. Only JPEG/PNG images are supported.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Image must be under 2MB');
  }
}

export async function savePaypalQrToR2(
  env: { R2_EKYC_BUCKET: R2Bucket },
  userPrefix: string,
  file: File,
): Promise<string> {
  validatePaypalQrImage(file);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const key = `${PAYPAL_QR_PREFIX}/${userPrefix}/qr.${ext}`;
  const buffer = await file.arrayBuffer();
  await env.R2_EKYC_BUCKET.put(key, buffer, {
    httpMetadata: { contentType: file.type },
  });
  return key;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export async function paypalQrKeyToDataUrl(
  env: { R2_EKYC_BUCKET: R2Bucket },
  key: string,
): Promise<string | null> {
  const obj = await env.R2_EKYC_BUCKET.get(key);
  if (!obj) return null;
  const buf = await obj.arrayBuffer();
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  return `data:${contentType};base64,${bufferToBase64(buf)}`;
}
