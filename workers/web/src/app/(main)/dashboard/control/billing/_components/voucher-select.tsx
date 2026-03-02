"use client";

import { useTranslations } from "next-intl";
import { Control } from "react-hook-form";

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { CreateOrder } from "./schema";

interface Voucher {
  id: string | number;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  discountValue: number;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "USAGE_BASED" | "TIERED";
}

interface VoucherSelectProps {
  control: Control<CreateOrder>;
  vouchers: Voucher[];
  isLoadingVouchers: boolean;
}

export function VoucherSelect({ control, vouchers, isLoadingVouchers }: VoucherSelectProps) {
  const t = useTranslations("BillingPage");

  return (
    <FormField
      control={control}
      name="voucherCode"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("voucher_code")}</FormLabel>
          <Select
            onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
            value={field.value ?? "none"}
            disabled={isLoadingVouchers}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={isLoadingVouchers ? t("loading") : t("select_voucher")} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="none">{t("no_voucher")}</SelectItem>
              {vouchers.length === 0 && !isLoadingVouchers ? (
                <SelectItem value="__no_vouchers__" disabled>
                  {t("no_vouchers_available")}
                </SelectItem>
              ) : (
                vouchers.map((voucher) => {
                  const discountText =
                    voucher.type === "PERCENTAGE"
                      ? `${voucher.discountValue}%`
                      : `${voucher.discountValue.toLocaleString()} VND`;
                  return (
                    <SelectItem key={voucher.id} value={voucher.code}>
                      {voucher.code} - {voucher.name} ({discountText})
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
          <FormDescription>{t("voucher_code_description")}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
