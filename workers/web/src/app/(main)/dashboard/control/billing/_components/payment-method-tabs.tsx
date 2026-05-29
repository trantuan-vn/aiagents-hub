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
  paypalEnabled: boolean;
  cassoLabel: string;
  vnpayLabel: string;
  paypalLabel: string;
  cassoPanel: ReactNode;
  vnpayPanel: ReactNode;
  paypalPanel: ReactNode;
}

export function PaymentMethodTabs({
  value,
  onValueChange,
  paypalEnabled,
  cassoLabel,
  vnpayLabel,
  paypalLabel,
  cassoPanel,
  vnpayPanel,
  paypalPanel,
}: PaymentMethodTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        const next = v as PaymentMethodTab;
        if (next === "vnpay" && !IS_VNPAY_PAYMENT_ENABLED) return;
        if (next === "paypal" && !paypalEnabled) return;
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
        <TabsTrigger value="paypal" disabled={!paypalEnabled} className={PAYMENT_TAB_TRIGGER_CLASS}>
          {paypalLabel}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="casso" className="mt-4 space-y-4">
        {cassoPanel}
      </TabsContent>

      <TabsContent value="vnpay" className="mt-4 space-y-4">
        {vnpayPanel}
      </TabsContent>

      <TabsContent value="paypal" className="mt-4 space-y-4">
        {paypalPanel}
      </TabsContent>
    </Tabs>
  );
}
