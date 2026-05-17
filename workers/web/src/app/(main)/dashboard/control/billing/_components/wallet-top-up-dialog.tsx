"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { createCreateOrderSchema, type CreateOrder } from "./schema";

const FALLBACK_USD_VND =
  Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000") > 0
    ? Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000")
    : 26000;

const PRESET_USD = [2, 5, 10, 20, 50, 100] as const;

interface WalletTopUpFormProps {
  onCreate: (data: CreateOrder) => Promise<unknown>;
  usdVndRate: number;
  minTopUpVnd: number;
  onDismiss: () => void;
}

function WalletTopUpForm({ onCreate, usdVndRate, minTopUpVnd, onDismiss }: WalletTopUpFormProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsd, setSelectedUsd] = useState<number | null>(10);

  const effectiveRate = usdVndRate > 0 ? usdVndRate : FALLBACK_USD_VND;
  const effectiveMin = Math.max(1, Math.floor(minTopUpVnd));

  const orderSchema = useMemo(() => createCreateOrderSchema(effectiveMin), [effectiveMin]);

  const defaultAmount = Math.max(effectiveMin, Math.round(10 * effectiveRate));

  const form = useForm<CreateOrder>({
    resolver: zodResolver(orderSchema) as Resolver<CreateOrder>,
    defaultValues: {
      amount: defaultAmount,
      currency: "VND",
      voucherCode: "",
      notes: "",
      paymentMethod: "",
    },
  });

  const amountVnd = form.watch("amount");

  const approxUsd = useMemo(() => {
    const v = Number(amountVnd) || 0;
    return v / effectiveRate;
  }, [amountVnd, effectiveRate]);

  const syncAmountFromUsd = useCallback(
    (usd: number): void => {
      const vnd = Math.max(effectiveMin, Math.round(usd * effectiveRate));
      form.setValue("amount", vnd, { shouldValidate: true });
    },
    [form, effectiveMin, effectiveRate],
  );

  useEffect(() => {
    if (selectedUsd != null) {
      syncAmountFromUsd(selectedUsd);
    }
  }, [selectedUsd, syncAmountFromUsd]);

  const onSubmit = async (data: CreateOrder): Promise<void> => {
    setIsLoading(true);
    try {
      await onCreate(data);
      form.reset();
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
        <div className="space-y-2">
          <Label htmlFor="usd-vnd-rate-readonly">{t("exchange_rate_label")}</Label>
          <Input
            id="usd-vnd-rate-readonly"
            readOnly
            tabIndex={-1}
            className="bg-muted font-mono"
            value={effectiveRate.toLocaleString("vi-VN")}
          />
          <p className="text-muted-foreground text-xs">{t("exchange_rate_hint")}</p>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {t("min_top_up_hint", { amount: effectiveMin.toLocaleString("vi-VN") })}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{t("preset_usd_label")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PRESET_USD.map((usd) => (
              <Button
                key={usd}
                type="button"
                variant={selectedUsd === usd ? "default" : "outline"}
                className={cn("h-11 font-semibold")}
                onClick={() => {
                  setSelectedUsd(usd);
                  syncAmountFromUsd(usd);
                }}
              >
                ${usd}
              </Button>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("amount_vnd_label")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={effectiveMin}
                  step={1}
                  {...field}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      field.onChange(0);
                      setSelectedUsd(null);
                      return;
                    }
                    const n = Number.parseInt(raw, 10);
                    field.onChange(Number.isFinite(n) ? n : 0);
                    setSelectedUsd(null);
                  }}
                />
              </FormControl>
              <FormDescription>
                {t("approx_usd", {
                  amount: approxUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }),
                })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="voucherCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("voucher_code")}</FormLabel>
              <FormControl>
                <Input placeholder={t("voucher_code_placeholder")} {...field} />
              </FormControl>
              <FormDescription>{t("voucher_code_description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
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

interface WalletTopUpDialogProps {
  onCreate: (data: CreateOrder) => Promise<unknown>;
  /** VND per 1 USD from system configuration (page loads via API). */
  usdVndRate: number;
  /** Minimum top-up amount (VND) from system configuration. */
  minTopUpVnd: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WalletTopUpDialog({
  onCreate,
  usdVndRate,
  minTopUpVnd,
  open: controlledOpen,
  onOpenChange,
}: WalletTopUpDialogProps) {
  const t = useTranslations("BillingPage");
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (next: boolean): void => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Wallet className="mr-1 h-4 w-4" />
          {t("top_up")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("top_up_title")}</DialogTitle>
          <DialogDescription>{t("top_up_description")}</DialogDescription>
        </DialogHeader>

        {open ? (
          <WalletTopUpForm
            key={`${minTopUpVnd}-${usdVndRate}`}
            onCreate={onCreate}
            usdVndRate={usdVndRate}
            minTopUpVnd={minTopUpVnd}
            onDismiss={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
