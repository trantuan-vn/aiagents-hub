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
import { formatUsd, formatWorkflowRoyaltyCr } from "@/lib/utils";

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
  commissionLabel: string;
  workflowLabel: string;
  totalLabel: string;
  markingPaid?: boolean;
  onPaid: () => void;
}

function QrDialogBody({
  selectedItem,
  qrLoading,
  qrError,
  qrSrc,
  hint,
  commissionLabel,
  workflowLabel,
  totalLabel,
}: Pick<
  EarningsPayoutQrDialogProps,
  "selectedItem" | "qrLoading" | "qrError" | "qrSrc" | "hint" | "commissionLabel" | "workflowLabel" | "totalLabel"
>) {
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
      {selectedItem ? (
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">{commissionLabel}: </span>
            {formatUsd(selectedItem.commissionAmountUsd)}
          </p>
          <p>
            <span className="text-muted-foreground">{workflowLabel}: </span>
            {formatWorkflowRoyaltyCr(
              selectedItem.workflowRoyaltyAmountCr,
              selectedItem.workflowRoyaltyAmountUsd,
            )}
          </p>
          <p className="font-medium">
            <span className="text-muted-foreground">{totalLabel}: </span>
            {formatUsd(selectedItem.totalAmountUsd)}
          </p>
        </div>
      ) : null}
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
  commissionLabel,
  workflowLabel,
  totalLabel,
  markingPaid = false,
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
        <QrDialogBody
          selectedItem={selectedItem}
          qrLoading={qrLoading}
          qrError={qrError}
          qrSrc={qrSrc}
          hint={hint}
          commissionLabel={commissionLabel}
          workflowLabel={workflowLabel}
          totalLabel={totalLabel}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={qrLoading || markingPaid || !!qrError || !qrSrc}
            onClick={onPaid}
          >
            {markingPaid ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {paidLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
