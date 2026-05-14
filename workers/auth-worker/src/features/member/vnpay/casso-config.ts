/** VietQR.io static account (env). */
export function getVietQrConfig(): { accountNo: string; accountName: string; acqId: string } {
  return {
    accountNo: process.env.VIETQR_ACCOUNT_NO || "0919358683",
    accountName: process.env.VIETQR_ACCOUNT_NAME || "TRAN ANH TUAN",
    acqId: process.env.VIETQR_ACQ_ID || "970422",
  };
}

export function getCassoWebhookChecksumKey(): string {
  return process.env.CASSO_WEBHOOK_CHECKSUM_KEY || "K7A17ZhOewsRnRHKOlLsKbzT7d8VJGdj0CPORi5iY141gRO1yWLUpXX9xpSCFaU1";
}
