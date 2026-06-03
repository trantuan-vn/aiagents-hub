"use client";

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

interface EarningsPaypalPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItem: PayoutItem | null;
  loading: boolean;
  error: string | null;
  success: boolean;
  title: string;
  hint: string;
  confirmLabel: string;
  cancelLabel: string;
  sendingLabel: string;
  successLabel: string;
  onConfirm: () => void;
}

export function EarningsPaypalPayoutDialog({
  open,
  onOpenChange,
  selectedItem,
  loading,
  error,
  success,
  title,
  hint,
  confirmLabel,
  cancelLabel,
  sendingLabel,
  successLabel,
  onConfirm,
}: EarningsPaypalPayoutDialogProps) {
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

        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-muted-foreground text-sm">{sendingLabel}</span>
          </div>
        ) : success ? (
          <p className="text-sm text-green-600 dark:text-green-400">{successLabel}</p>
        ) : (
          <div className="space-y-3 text-sm">
            {selectedItem?.beneficiaryHint && (
              <p>
                <span className="text-muted-foreground">{hint}: </span>
                <span className="font-mono">{selectedItem.beneficiaryHint}</span>
              </p>
            )}
            {error && <p className="text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          {!success && (
            <Button type="button" disabled={loading || !selectedItem} onClick={onConfirm}>
              {loading ? sendingLabel : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
