"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn, formatUsd } from "@/lib/utils";

import { fetchAvailableVouchers } from "./billing-api";
import { createUsdTopUpOrderSchema, MIN_TOP_UP_USD, type CreateOrder } from "./schema";
import { formatUsdInputValue, parseUsdInput, sanitizeUsdInput, type AvailableVoucher } from "./wallet-top-up-utils";
import { WalletTopUpVoucherField } from "./wallet-top-up-voucher-field";

const PRESET_USD = [2, 5, 10, 20, 50, 100] as const;

interface WalletTopUpFormProps {
  onCreate: (data: CreateOrder) => Promise<unknown>;
  onDismiss: () => void;
}

export function WalletTopUpForm({ onCreate, onDismiss }: WalletTopUpFormProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [usdInput, setUsdInput] = useState("10");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(10);
  const [usdInputError, setUsdInputError] = useState<string | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [availableVouchers, setAvailableVouchers] = useState<AvailableVoucher[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  const orderSchema = useMemo(() => createUsdTopUpOrderSchema(MIN_TOP_UP_USD), []);

  const form = useForm<CreateOrder>({
    resolver: zodResolver(orderSchema) as Resolver<CreateOrder>,
    defaultValues: {
      amount: 10,
      currency: "USD",
      voucherCode: "",
      notes: "",
      paymentMethod: "",
    },
  });

  const applyUsdAmount = useCallback(
    (usd: number, preset: number | null): void => {
      const value = Math.round(usd * 100) / 100;
      setUsdInput(formatUsdInputValue(value));
      setSelectedPreset(preset);
      setUsdInputError(null);
      form.setValue("amount", value, { shouldValidate: false });
    },
    [form],
  );

  const refreshVouchers = useCallback(
    async (amountUsd: number) => {
      if (amountUsd < MIN_TOP_UP_USD) {
        setAvailableVouchers([]);
        form.setValue("voucherCode", "");
        return;
      }
      setLoadingVouchers(true);
      try {
        const list = await fetchAvailableVouchers(amountUsd);
        setAvailableVouchers(list);
        form.setValue("voucherCode", list[0]?.code ?? "");
      } finally {
        setLoadingVouchers(false);
      }
    },
    [form],
  );

  useEffect(() => {
    const parsed = parseUsdInput(usdInput);
    if (parsed == null) return;
    const timer = setTimeout(() => {
      void refreshVouchers(parsed);
    }, 300);
    return () => clearTimeout(timer);
  }, [usdInput, refreshVouchers]);

  const selectedVoucherCode = form.watch("voucherCode");
  const selectedVoucher = availableVouchers.find((v) => v.code === selectedVoucherCode);

  const onSubmit = async (data: CreateOrder): Promise<void> => {
    const usd = parseUsdInput(usdInput);
    if (usd == null) {
      setUsdInputError(t("amount_usd_required"));
      return;
    }
    if (usd < MIN_TOP_UP_USD) {
      setUsdInputError(t("min_top_up_hint", { amount: formatUsd(MIN_TOP_UP_USD) }));
      return;
    }
    setUsdInputError(null);

    setIsLoading(true);
    try {
      await onCreate({ ...data, amount: usd, currency: "USD" });
      form.reset();
      applyUsdAmount(10, 10);
      onDismiss();
      toast({
        title: t("order_created"),
        description: t("order_created_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("create_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-muted-foreground text-sm">{t("min_top_up_hint", { amount: formatUsd(MIN_TOP_UP_USD) })}</p>

        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{t("preset_usd_label")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PRESET_USD.map((usd) => (
              <Button
                key={usd}
                type="button"
                variant={selectedPreset === usd ? "default" : "outline"}
                className={cn("h-11 font-semibold")}
                onClick={() => applyUsdAmount(usd, usd)}
              >
                ${usd}
              </Button>
            ))}
          </div>
        </div>

        <FormItem>
          <FormLabel htmlFor="top-up-usd-amount">{t("amount_usd_label")}</FormLabel>
          <FormControl>
            <div className="relative">
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-medium">
                $
              </span>
              <Input
                id="top-up-usd-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="pl-7"
                value={usdInput}
                onChange={(e) => {
                  const next = sanitizeUsdInput(e.target.value);
                  setUsdInput(next);
                  setSelectedPreset(null);
                  setUsdInputError(null);
                  const parsed = parseUsdInput(next);
                  if (parsed != null) {
                    form.setValue("amount", parsed, { shouldValidate: false });
                  }
                }}
              />
            </div>
          </FormControl>
          {usdInputError ? <p className="text-destructive text-sm">{usdInputError}</p> : null}
        </FormItem>

        <WalletTopUpVoucherField
          control={form.control}
          voucherOpen={voucherOpen}
          onVoucherOpenChange={setVoucherOpen}
          loadingVouchers={loadingVouchers}
          availableVouchers={availableVouchers}
          selectedVoucher={selectedVoucher}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("notes")}</FormLabel>
              <FormControl>
                <Textarea placeholder={t("notes_placeholder")} {...field} />
              </FormControl>
              <FormDescription>{t("notes_description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDismiss}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t("creating") : t("create_top_up")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
