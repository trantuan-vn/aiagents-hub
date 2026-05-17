import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { useToast } from "@/hooks/use-toast";

import type { PaymentMethodTab } from "./payment-dialog-constants";

interface UseCassoQrOptions {
  open: boolean;
  paymentTab: PaymentMethodTab;
  orderId: number;
  orderFinalAmount: number;
  watchedAmount: number;
  onCassoQr: (orderId: number, amount: number) => Promise<{ qr: string }>;
}

export function useCassoQr({
  open,
  paymentTab,
  orderId,
  orderFinalAmount,
  watchedAmount,
  onCassoQr,
}: UseCassoQrOptions) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [cassoQr, setCassoQr] = useState<string | null>(null);
  const [cassoLoading, setCassoLoading] = useState(false);
  const [cassoError, setCassoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCassoQr(null);
      setCassoError(null);
      setCassoLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || paymentTab !== "casso") {
      return;
    }
    let cancelled = false;
    setCassoLoading(true);
    setCassoError(null);
    setCassoQr(null);
    const amount = typeof watchedAmount === "number" && !Number.isNaN(watchedAmount) ? watchedAmount : orderFinalAmount;
    void onCassoQr(orderId, amount)
      .then((res) => {
        if (!cancelled) {
          setCassoQr(res.qr);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : t("casso_qr_error");
          setCassoError(message);
          toast({ title: t("error"), description: message, variant: "destructive" });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCassoLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, paymentTab, watchedAmount, orderId, onCassoQr, orderFinalAmount, t, toast]);

  return { cassoQr, cassoLoading, cassoError };
}
