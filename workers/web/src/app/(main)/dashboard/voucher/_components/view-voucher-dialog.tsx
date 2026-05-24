"use client";

import type { ReactNode } from "react";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import type { Voucher } from "./schema";
import {
  getMembershipTierLabel,
  getVoucherDiscountPercent,
  getVoucherStatusBadge,
  getVoucherTierLabel,
} from "./voucher-display-utils";

interface ViewVoucherDialogProps {
  voucher: Voucher;
  formatDate: (dateString: string | undefined) => string;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{value}</dd>
    </div>
  );
}

export function ViewVoucherDialog({ voucher, formatDate }: ViewVoucherDialogProps) {
  const t = useTranslations("VoucherPage");
  const { variant, labelKey } = getVoucherStatusBadge(voucher);
  const discountDisplay = `${getVoucherDiscountPercent(voucher)}%`;
  const tierLabel = getVoucherTierLabel(voucher, t("form.applicable_all"));
  const tiersDisplay =
    voucher.applicableTo === "GROUPS" && voucher.membershipTiers?.length
      ? voucher.membershipTiers.map((tier) => getMembershipTierLabel(tier)).join(", ")
      : tierLabel;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title={t("view")}>
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("view_voucher")}</DialogTitle>
          <DialogDescription>{voucher.name}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3">
          <DetailRow
            label={t("form.status")}
            value={
              <Badge variant={variant} className="text-xs">
                {t(labelKey)}
              </Badge>
            }
          />
          <Separator />
          <DetailRow label={t("form.code")} value={<span className="font-mono">{voucher.code}</span>} />
          <DetailRow label={t("form.name")} value={voucher.name} />
          <DetailRow label={t("form.discount_percent")} value={discountDisplay} />
          <DetailRow label={t("form.applicable_to")} value={tiersDisplay} />
          <DetailRow
            label={t("form.min_order_amount")}
            value={voucher.minOrderAmount != null ? voucher.minOrderAmount.toLocaleString() : "—"}
          />
          <DetailRow
            label={t("form.max_discount_amount")}
            value={voucher.maxDiscountAmount != null ? voucher.maxDiscountAmount.toLocaleString() : "—"}
          />
          <DetailRow
            label={t("form.usage_limit")}
            value={
              voucher.usageLimit != null
                ? t("usage", {
                    used: String(voucher.usedCount ?? 0),
                    limit: String(voucher.usageLimit),
                  })
                : t("view_unlimited_usage")
            }
          />
          <DetailRow
            label={t("form.expires_at")}
            value={voucher.expiresAt ? formatDate(voucher.expiresAt) : t("never_expires")}
          />
          {voucher.createdAt ? (
            <DetailRow label={t("view_created_at")} value={formatDate(voucher.createdAt)} />
          ) : null}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
