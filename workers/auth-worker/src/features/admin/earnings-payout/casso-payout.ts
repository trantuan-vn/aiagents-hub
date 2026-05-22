/** Casso outbound (payout) transfer codes — distinct from inbound `C…` codes. */

export function randomPayoutTransferCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return `P${Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export interface EarningsPayoutCassoMapping {
  type: 'earnings_payout';
  recipientUserId: string;
  payoutKeys: string[];
  amountVnd: number;
}

export function parseEarningsPayoutCassoMapping(raw: string): EarningsPayoutCassoMapping | null {
  try {
    const parsed = JSON.parse(raw) as EarningsPayoutCassoMapping;
    if (parsed?.type !== 'earnings_payout' || !parsed.recipientUserId || !Array.isArray(parsed.payoutKeys)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
