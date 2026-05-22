import crypto from "crypto";

/** Recursively sort object keys (Casso webhook v2 signature). */
export function sortObjDataByKey(data: Record<string, unknown>): Record<string, unknown> {
  const sortedObj: Record<string, unknown> = {};
  Object.keys(data)
    .sort()
    .forEach((key) => {
      const v = data[key];
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        sortedObj[key] = sortObjDataByKey(v as Record<string, unknown>);
      } else {
        sortedObj[key] = v;
      }
    });
  return sortedObj;
}

/**
 * Verify X-Casso-Signature header against webhook JSON body.
 * @see https://github.com/CassoHQ/casso-webhook-v2-verify-signature/blob/main/javascript.js
 */
export function verifyCassoWebhookSignature(
  signatureHeader: string | undefined,
  webhookPayload: Record<string, unknown>,
  checksumKey: string,
): boolean {
  if (!signatureHeader || !checksumKey) {
    return false;
  }
  const match = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/i);
  if (!match) {
    return false;
  }
  const timestampStr = match[1];
  const signature = match[2].toLowerCase();
  const sortedDataByKey = sortObjDataByKey(webhookPayload);
  const messageToSign = `${timestampStr}.${JSON.stringify(sortedDataByKey)}`;
  const generatedSignature = crypto.createHmac("sha512", checksumKey).update(messageToSign).digest("hex");
  return signature === generatedSignature;
}

const INBOUND_TRANSFER_CODE_RE = /C[0-9A-F]{16}/i;
const PAYOUT_TRANSFER_CODE_RE = /P[0-9A-F]{16}/i;

export type CassoTransferKind = 'inbound' | 'payout';

/** Extract VietQR / Casso transfer code embedded in bank transfer description (addInfo). */
export function extractCassoTransferCode(description: string): string | null {
  const found = extractCassoTransfer(description);
  return found?.code ?? null;
}

/** Inbound payments use `C…`; outbound earnings payouts use `P…`. */
export function extractCassoTransfer(
  description: string,
): { code: string; kind: CassoTransferKind } | null {
  if (!description) {
    return null;
  }
  const payout = description.match(PAYOUT_TRANSFER_CODE_RE);
  if (payout) {
    return { code: payout[0].toUpperCase(), kind: 'payout' };
  }
  const inbound = description.match(INBOUND_TRANSFER_CODE_RE);
  if (inbound) {
    return { code: inbound[0].toUpperCase(), kind: 'inbound' };
  }
  return null;
}
