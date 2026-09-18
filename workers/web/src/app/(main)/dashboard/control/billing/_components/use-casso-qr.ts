import { useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import { useToast } from "@/hooks/use-toast";

import type { PaymentMethodTab } from "./payment-dialog-constants";

interface UseCassoQrOptions {
  open: boolean;
  paymentTab: PaymentMethodTab;
  orderId: number;
  orderPayableVnd: number;
  onCassoQr: (orderId: number, amount: number) => Promise<{ qr: string }>;
}

export function useCassoQr({
  open,
  paymentTab,
  orderId,
  orderPayableVnd,
  onCassoQr,
}: UseCassoQrOptions) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [cassoQr, setCassoQr] = useState<string | null>(null);
  const [cassoLoading, setCassoLoading] = useState(false);
  const [cassoError, setCassoError] = useState<string | null>(null);

  const onCassoQrRef = useRef(onCassoQr);
  onCassoQrRef.current = onCassoQr;
  const tRef = useRef(t);
  tRef.current = t;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const loadedKeyRef = useRef<string | null>(null);

  const requestKey = `${orderId}:${orderPayableVnd}`;

  useEffect(() => {
    if (!open) {
      setCassoQr(null);
      setCassoError(null);
      setCassoLoading(false);
      loadedKeyRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || paymentTab !== "casso") return;
    if (loadedKeyRef.current === requestKey) return;

    let cancelled = false;
    setCassoLoading(true);
    setCassoError(null);
    setCassoQr(null);
    void onCassoQrRef
      .current(orderId, orderPayableVnd)
      .then((res) => {
        if (cancelled) return;
        loadedKeyRef.current = requestKey;
        setCassoQr(res.qr);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : tRef.current("casso_qr_error");
        setCassoError(message);
        toastRef.current({ title: tRef.current("error"), description: message, variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setCassoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, paymentTab, orderId, orderPayableVnd, requestKey]);

  return { cassoQr, cassoLoading, cassoError };
}
