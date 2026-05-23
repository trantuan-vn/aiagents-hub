import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export type JwtPayload = {
  sub: string;
  identifier: string;
  exp: number;
  iat: number;
  type: string;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getInitials = (str: string): string => {
  if (typeof str !== "string" || !str.trim()) return "?";

  return (
    str
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
};

/** Matches auth-worker `roundUsdAmount` precision for wallet, earnings, and usage. */
export const USD_DECIMAL_PLACES = 8;

export function formatCurrency(
  amount: number,
  opts?: {
    currency?: string;
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    noDecimals?: boolean;
  },
) {
  const { currency = "USD", locale = "en-US", minimumFractionDigits, maximumFractionDigits, noDecimals } = opts ?? {};

  const formatOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: noDecimals ? 0 : minimumFractionDigits,
    maximumFractionDigits: noDecimals ? 0 : maximumFractionDigits,
  };

  return new Intl.NumberFormat(locale, formatOptions).format(amount);
}

/** USD amounts (wallet balance, earnings, orders) — up to 8 decimal places. */
export function formatUsd(amount: number, locale = "en-US"): string {
  return formatCurrency(amount, {
    currency: "USD",
    locale,
    maximumFractionDigits: USD_DECIMAL_PLACES,
  });
}
