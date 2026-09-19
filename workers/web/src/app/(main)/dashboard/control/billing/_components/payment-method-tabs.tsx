"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  IS_VNPAY_PAYMENT_ENABLED,
  PAYMENT_TAB_TRIGGER_CLASS,
  paymentTabsListClass,
  type PaymentMethodTab,
} from "./payment-dialog-constants";

interface PaymentMethodTabsProps {
  value: PaymentMethodTab;
  onValueChange: (tab: PaymentMethodTab) => void;
  paypalEnabled: boolean;
  cassoLabel: string;
  vnpayLabel?: string;
  paypalLabel: string;
  cassoPanel: ReactNode;
  vnpayPanel?: ReactNode;
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
  const showVnpay = IS_VNPAY_PAYMENT_ENABLED;
  return (
    <Tabs
      value={value === "vnpay" && !showVnpay ? "casso" : value}
      onValueChange={(v) => {
        const next = v as PaymentMethodTab;
        if (next === "vnpay" && !showVnpay) return;
        if (next === "paypal" && !paypalEnabled) return;
        onValueChange(next);
      }}
      className="w-full"
    >
      <TabsList className={paymentTabsListClass(showVnpay ? 3 : 2)}>
        <TabsTrigger value="casso" className={PAYMENT_TAB_TRIGGER_CLASS}>
          {cassoLabel}
        </TabsTrigger>
        {showVnpay ? (
          <TabsTrigger value="vnpay" className={PAYMENT_TAB_TRIGGER_CLASS}>
            {vnpayLabel}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="paypal" disabled={!paypalEnabled} className={PAYMENT_TAB_TRIGGER_CLASS}>
          {paypalLabel}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="casso" className="mt-4 space-y-4">
        {cassoPanel}
      </TabsContent>

      {showVnpay ? (
        <TabsContent value="vnpay" className="mt-4 space-y-4">
          {vnpayPanel}
        </TabsContent>
      ) : null}

      <TabsContent value="paypal" className="mt-4 space-y-4">
        {paypalPanel}
      </TabsContent>
    </Tabs>
  );
}
