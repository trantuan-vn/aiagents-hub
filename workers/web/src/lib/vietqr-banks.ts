export interface VietQrBank {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo: string;
  transferSupported?: number;
  isTransfer?: number;
}

interface VietQrBanksResponse {
  code?: string;
  desc?: string;
  data?: VietQrBank[];
}

const BANKS_URL = "https://api.vietqr.io/v2/banks";

/** Banks that support transfers (for payout QR). */
export async function fetchVietQrBanks(): Promise<VietQrBank[]> {
  const res = await fetch(BANKS_URL, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Failed to load banks (${res.status})`);
  }
  const json: VietQrBanksResponse = await res.json();
  const list = json.data ?? [];
  return list
    .filter((b) => b.isTransfer === 1 || b.transferSupported === 1)
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "vi"));
}

export function findBankByBin(banks: VietQrBank[], bin: string): VietQrBank | undefined {
  return banks.find((b) => b.bin === bin);
}
