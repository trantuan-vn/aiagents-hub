/** VietQR.io static account (Secrets Store). */
export async function getVietQrConfig(env: Env): Promise<{ accountNo: string; accountName: string; acqId: string }> {
  const [accountNo, accountName, acqId] = await Promise.all([
    env.VIETQR_ACCOUNT_NO.get(),
    env.VIETQR_ACCOUNT_NAME.get(),
    env.VIETQR_ACQ_ID.get(),
  ]);
  if (!accountNo) {
    throw new Error("VIETQR_ACCOUNT_NO is not defined in secrets store");
  }
  if (!accountName) {
    throw new Error("VIETQR_ACCOUNT_NAME is not defined in secrets store");
  }
  if (!acqId) {
    throw new Error("VIETQR_ACQ_ID is not defined in secrets store");
  }
  return { accountNo, accountName, acqId };
}

export async function getCassoWebhookChecksumKey(env: Env): Promise<string> {
  const key = await env.CASSO_WEBHOOK_CHECKSUM_KEY.get();
  if (!key) {
    throw new Error("CASSO_WEBHOOK_CHECKSUM_KEY is not defined in secrets store");
  }
  return key;
}
