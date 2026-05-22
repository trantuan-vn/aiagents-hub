export interface VietQrAccount {
  accountNo: string;
  accountName: string;
  acqId: string;
}

export interface GenerateVietQrParams {
  account: VietQrAccount;
  amount: number;
  addInfo?: string;
}

/** Generate VietQR compact image (data URL) for outbound transfers. */
export async function generateVietQr(params: GenerateVietQrParams): Promise<string> {
  const { account, amount, addInfo } = params;
  if (!amount || amount < 1) {
    throw new Error('Invalid payout amount');
  }
  const body: Record<string, unknown> = {
    accountNo: account.accountNo,
    accountName: account.accountName,
    acqId: account.acqId,
    amount: Math.round(amount),
    format: 'text',
    template: 'compact',
  };
  if (addInfo) body.addInfo = addInfo.slice(0, 100);

  const res = await fetch('https://api.vietqr.io/v2/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`VietQR HTTP ${res.status}`);
  }
  const jr = (await res.json()) as { data?: { qrDataURL?: string } };
  const qr = jr.data?.qrDataURL;
  if (!qr) throw new Error('Failed to generate VietQR');
  return qr;
}
