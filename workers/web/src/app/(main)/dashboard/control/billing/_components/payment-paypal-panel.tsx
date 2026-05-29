"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

import type { PaypalButtonsInstance } from "./paypal-types";
import { usePaypalSdk } from "./use-paypal-sdk";

interface PaymentPaypalPanelProps {
  active: boolean;
  clientId: string;
  hint: string;
  amountLabel: string;
  loadingLabel: string;
  errorLabel: string;
  unavailableLabel: string;
  processingLabel: string;
  cancelLabel: string;
  onCreateOrder: () => Promise<string>;
  onApprove: (paypalOrderId: string) => Promise<void>;
  onError: (message: string) => void;
  onCancel: () => void;
}

export function PaymentPaypalPanel({
  active,
  clientId,
  hint,
  amountLabel,
  loadingLabel,
  errorLabel,
  unavailableLabel,
  processingLabel,
  cancelLabel,
  onCreateOrder,
  onApprove,
  onError,
  onCancel,
}: PaymentPaypalPanelProps) {
  const status = usePaypalSdk(active, clientId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonsRef = useRef<PaypalButtonsInstance | null>(null);
  const [processing, setProcessing] = useState(false);

  // Keep latest callbacks without forcing a buttons re-render.
  const handlersRef = useRef({ onCreateOrder, onApprove, onError });
  handlersRef.current = { onCreateOrder, onApprove, onError };

  useEffect(() => {
    if (status !== "ready" || !active) return;
    const paypal = window.paypal;
    const container = containerRef.current;
    if (!paypal || !container) return;

    container.innerHTML = "";
    const buttons = paypal.Buttons({
      style: { layout: "vertical", shape: "rect", label: "paypal" },
      createOrder: () => handlersRef.current.onCreateOrder(),
      onApprove: async (data) => {
        setProcessing(true);
        try {
          await handlersRef.current.onApprove(data.orderID);
        } catch (e) {
          handlersRef.current.onError(e instanceof Error ? e.message : "PayPal error");
        } finally {
          setProcessing(false);
        }
      },
      onError: (err) => {
        setProcessing(false);
        handlersRef.current.onError(err instanceof Error ? err.message : "PayPal error");
      },
    });
    buttonsRef.current = buttons;
    void buttons.render(container).catch(() => {
      /* render aborted (e.g. dialog closed) */
    });

    return () => {
      try {
        buttonsRef.current?.close();
      } catch {
        /* ignore */
      }
      buttonsRef.current = null;
    };
  }, [status, active]);

  return (
    <>
      <p className="text-muted-foreground text-sm">{hint}</p>
      <div className="bg-muted rounded-lg border p-4">
        <p className="mb-3 text-center text-sm font-medium">{amountLabel}</p>
        <div className="relative min-h-[160px]">
          {(status === "loading" || processing) && (
            <div className="bg-muted/70 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
              <Loader2 className="text-muted-foreground h-7 w-7 animate-spin" />
              <span className="text-muted-foreground text-sm">
                {processing ? processingLabel : loadingLabel}
              </span>
            </div>
          )}
          {status === "error" && <p className="text-destructive text-center text-sm">{errorLabel}</p>}
          {status === "disabled" && (
            <p className="text-muted-foreground text-center text-sm">{unavailableLabel}</p>
          )}
          <div ref={containerRef} />
        </div>
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
