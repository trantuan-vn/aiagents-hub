"use client";

import Image from "next/image";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUsd } from "@/lib/utils";

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
  cancelLabel: string;
  paidLabel: string;
  onPaid: () => void;
}

function QrDialogBody({
  selectedItem,
  qrLoading,
  qrError,
  qrSrc,
  hint,
}: Pick<EarningsPayoutQrDialogProps, "selectedItem" | "qrLoading" | "qrError" | "qrSrc" | "hint">) {
  if (qrLoading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (qrError) {
    return <p className="text-destructive text-sm">{qrError}</p>;
  }
  return (
    <>
      {qrSrc && (
        <div className="flex justify-center p-2">
          <Image src={qrSrc} alt="" width={280} height={280} unoptimized className="max-h-[280px] object-contain" />
        </div>
      )}
      {selectedItem && <p className="text-muted-foreground text-center text-xs">{hint}</p>}
    </>
  );
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
  cancelLabel,
  paidLabel,
  onPaid,
}: EarningsPayoutQrDialogProps) {
  const description = selectedItem
    ? `${selectedItem.recipientIdentifier} — ${formatUsd(selectedItem.totalAmountUsd)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <QrDialogBody selectedItem={selectedItem} qrLoading={qrLoading} qrError={qrError} qrSrc={qrSrc} hint={hint} />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" disabled={qrLoading || !!qrError || !qrSrc} onClick={onPaid}>
            {paidLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
