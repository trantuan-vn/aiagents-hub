"use client";

import { useState } from "react";

import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { CreateOrder } from "./schema";
import { WalletTopUpForm } from "./wallet-top-up-form";

interface WalletTopUpDialogProps {
  onCreate: (data: CreateOrder) => Promise<unknown>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WalletTopUpDialog({ onCreate, open: controlledOpen, onOpenChange }: WalletTopUpDialogProps) {
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

        {open ? <WalletTopUpForm onCreate={onCreate} onDismiss={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
