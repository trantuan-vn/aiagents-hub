"use client";

import Image from "next/image";

import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface PaymentCassoPanelProps {
  hint: string;
  loading: boolean;
  loadingLabel: string;
  error: string | null;
  qrSrc: string | null;
  success?: boolean;
  successLabel?: string;
  cancelLabel: string;
  paidDoneLabel: string;
  onCancel: () => void;
  onPaidDone: () => void;
}

export function PaymentCassoPanel({
  hint,
  loading,
  loadingLabel,
  error,
  qrSrc,
  success = false,
  successLabel,
  cancelLabel,
  paidDoneLabel,
  onCancel,
  onPaidDone,
}: PaymentCassoPanelProps) {
  return (
    <>
      <p className="text-muted-foreground text-sm">{hint}</p>
      <div className="bg-muted flex min-h-[220px] items-center justify-center rounded-lg border p-4">
        {success && (
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <span className="text-sm font-medium">{successLabel}</span>
          </div>
        )}
        {!success && loading && !qrSrc && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            <span className="text-muted-foreground text-sm">{loadingLabel}</span>
          </div>
        )}
        {!success && !qrSrc && error && <p className="text-destructive text-center text-sm">{error}</p>}
        {!success && qrSrc && (
          <Image
            src={qrSrc}
            alt=""
            width={280}
            height={280}
            unoptimized
            className="max-h-[280px] max-w-full object-contain"
          />
        )}
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={success}>
          {cancelLabel}
        </Button>
        <Button type="button" onClick={onPaidDone} disabled={success}>
          {paidDoneLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
