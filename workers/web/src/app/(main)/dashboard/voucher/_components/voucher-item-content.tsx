"use client";

import { Calendar, Gift } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import type { Voucher } from "./schema";
import { getVoucherDiscountPercent, getVoucherStatusBadge, getVoucherTierLabel } from "./voucher-display-utils";

export function VoucherItemContent({
  voucher,
  formatDate,
  t,
}: {
  voucher: Voucher;
  formatDate: (dateString: string | undefined) => string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { variant, labelKey } = getVoucherStatusBadge(voucher);
  const discountDisplay = `${getVoucherDiscountPercent(voucher)}%`;
  const tierLabel = getVoucherTierLabel(voucher, t("form.applicable_all"));

  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
        <Gift className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">{voucher.name}</span>
          <Badge variant={variant} className="text-xs">
            {t(labelKey)}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <span className="font-mono">{voucher.code}</span>
          <span>{t("discount", { value: discountDisplay })}</span>
          <span>{t("tiers", { value: tierLabel })}</span>
          {voucher.usageLimit ? (
            <span>
              {t("usage", {
                used: String(voucher.usedCount || 0),
                limit: String(voucher.usageLimit),
              })}
            </span>
          ) : null}
          {voucher.expiresAt ? (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(voucher.expiresAt)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
