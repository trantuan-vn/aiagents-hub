export function sanitizeUsdInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

export function parseUsdInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === ".") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatUsdInputValue(usd: number): string {
  const rounded = Math.round(usd * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export type AvailableVoucher = {
  code: string;
  name: string;
  discountPercent?: number;
  estimatedDiscount?: number;
};
