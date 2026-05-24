"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatUsd } from "@/lib/utils";

import type { CreateOrder } from "./schema";
import type { AvailableVoucher } from "./wallet-top-up-utils";

interface WalletTopUpVoucherFieldProps {
  control: Control<CreateOrder>;
  voucherOpen: boolean;
  onVoucherOpenChange: (open: boolean) => void;
  loadingVouchers: boolean;
  availableVouchers: AvailableVoucher[];
  selectedVoucher?: AvailableVoucher;
}

export function WalletTopUpVoucherField({
  control,
  voucherOpen,
  onVoucherOpenChange,
  loadingVouchers,
  availableVouchers,
  selectedVoucher,
}: WalletTopUpVoucherFieldProps) {
  const t = useTranslations("BillingPage");

  return (
    <FormField
      control={control}
      name="voucherCode"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{t("voucher_code")}</FormLabel>
          <Popover open={voucherOpen} onOpenChange={onVoucherOpenChange}>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className={cn("justify-between font-normal", !field.value && "text-muted-foreground")}
                >
                  {loadingVouchers
                    ? t("loading_vouchers")
                    : selectedVoucher
                      ? `${selectedVoucher.code} — ${selectedVoucher.name}`
                      : t("voucher_auto_best")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder={t("voucher_search_placeholder")} />
                <CommandList>
                  <CommandEmpty>{t("no_vouchers")}</CommandEmpty>
                  <CommandGroup>
                    {availableVouchers.map((voucher) => (
                      <CommandItem
                        key={voucher.code}
                        value={`${voucher.code} ${voucher.name}`}
                        onSelect={() => {
                          field.onChange(voucher.code);
                          onVoucherOpenChange(false);
                        }}
                      >
                        <Check
                          className={cn("mr-2 h-4 w-4", field.value === voucher.code ? "opacity-100" : "opacity-0")}
                        />
                        <span className="flex flex-1 flex-col">
                          <span className="font-medium">{voucher.code}</span>
                          <span className="text-muted-foreground text-xs">
                            {voucher.name}
                            {typeof voucher.estimatedDiscount === "number"
                              ? ` · -${formatUsd(voucher.estimatedDiscount)}`
                              : ""}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormDescription>{t("voucher_code_description")}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
