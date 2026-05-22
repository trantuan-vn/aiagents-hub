"use client";

import Image from "next/image";

import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

import type { PayoutItem } from "./earnings-payout-table";

interface EarningsPayoutQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: PayoutItem | null;
  qrLoading: boolean;
  qrError: string | null;
  qrSrc: string | null;
  title: string;
  hint: string;
}

export function EarningsPayoutQrDialog({
  open,
  onOpenChange,
  selectedItem,
  qrLoading,
  qrError,
  qrSrc,
  title,
  hint,
}: EarningsPayoutQrDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {selectedItem
              ? `${selectedItem.recipientIdentifier} — ${formatCurrency(selectedItem.totalAmountVnd, { currency: "VND", noDecimals: true })}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {qrLoading && (
          <div className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
        {!qrLoading && qrError && <p className="text-destructive text-sm">{qrError}</p>}
        {!qrLoading && !qrError && qrSrc && (
          <div className="flex justify-center p-2">
            <Image
              src={qrSrc}
              alt=""
              width={280}
              height={280}
              unoptimized
              className="max-h-[280px] object-contain"
            />
          </div>
        )}
        {selectedItem && <p className="text-muted-foreground text-center text-xs">{hint}</p>}
      </DialogContent>
    </Dialog>
  );
}
