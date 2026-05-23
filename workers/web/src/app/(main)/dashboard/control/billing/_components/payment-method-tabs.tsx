"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  IS_VNPAY_PAYMENT_ENABLED,
  PAYMENT_TAB_TRIGGER_CLASS,
  PAYMENT_TABS_LIST_CLASS,
  type PaymentMethodTab,
} from "./payment-dialog-constants";

interface PaymentMethodTabsProps {
  value: PaymentMethodTab;
  onValueChange: (tab: PaymentMethodTab) => void;
  cassoLabel: string;
  vnpayLabel: string;
  cassoPanel: ReactNode;
  vnpayPanel: ReactNode;
}

export function PaymentMethodTabs({
  value,
  onValueChange,
  cassoLabel,
  vnpayLabel,
  cassoPanel,
  vnpayPanel,
}: PaymentMethodTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const next = v as PaymentMethodTab;
        if (next === "vnpay" && !IS_VNPAY_PAYMENT_ENABLED) return;
        onValueChange(next);
      }}
      className="w-full"
    >
      <TabsList className={PAYMENT_TABS_LIST_CLASS}>
        <TabsTrigger value="casso" className={PAYMENT_TAB_TRIGGER_CLASS}>
          {cassoLabel}
        </TabsTrigger>
        <TabsTrigger value="vnpay" disabled={!IS_VNPAY_PAYMENT_ENABLED} className={PAYMENT_TAB_TRIGGER_CLASS}>
          {vnpayLabel}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="casso" className="mt-4 space-y-4">
        {cassoPanel}
      </TabsContent>

      <TabsContent value="vnpay" className="mt-4 space-y-4">
        {vnpayPanel}
      </TabsContent>
    </Tabs>
  );
}
