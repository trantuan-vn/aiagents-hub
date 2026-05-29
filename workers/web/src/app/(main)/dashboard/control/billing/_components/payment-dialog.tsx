"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

import { PaymentCassoPanel } from "./payment-casso-panel";
import { formatPaymentCurrency, formatVndCheckoutAmount, type PaymentMethodTab } from "./payment-dialog-constants";
import { PaymentMethodTabs } from "./payment-method-tabs";
import { PaymentPaypalPanel } from "./payment-paypal-panel";
import { PaymentVnpayPanel } from "./payment-vnpay-panel";
import { CreatePaymentSchema, getOrderPayableVnd, type CreatePayment, type Order } from "./schema";
import { useCassoQr } from "./use-casso-qr";

interface PaymentDialogProps {
  order: Order;
  usdVndRate: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (orderId: number, amount: number, bankCode: string, language: string) => Promise<void>;
  onCassoQr: (orderId: number, amount: number) => Promise<{ qr: string }>;
  onPaypalCreateOrder: (orderId: number) => Promise<string>;
  onPaypalCapture: (orderId: number, paypalOrderId: string) => Promise<void>;
  paypalClientId: string;
  paypalEnabled: boolean;
  onPaidDone?: () => void;
  initialTab?: PaymentMethodTab;
}

export function PaymentDialog({
  order,
  usdVndRate,
  open,
  onOpenChange,
  onPayment,
  onCassoQr,
  onPaypalCreateOrder,
  onPaypalCapture,
  paypalClientId,
  paypalEnabled,
  onPaidDone,
  initialTab = "casso",
}: PaymentDialogProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentTab, setPaymentTab] = useState<PaymentMethodTab>(initialTab);

  const payableVnd = getOrderPayableVnd(order, usdVndRate);

  const form = useForm<CreatePayment>({
    resolver: zodResolver(CreatePaymentSchema) as Resolver<CreatePayment>,
    defaultValues: {
      orderId: order.id,
      amount: payableVnd,
      bankCode: "",
      language: "vn",
    },
  });

  const { cassoQr, cassoLoading, cassoError } = useCassoQr({
    open,
    paymentTab,
    orderId: order.id,
    orderPayableVnd: payableVnd,
    onCassoQr,
  });

  const onSubmit = async (data: CreatePayment): Promise<void> => {
    setIsLoading(true);
    try {
      await onPayment(data.orderId, payableVnd, data.bankCode, data.language);
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("payment_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaidDone = (): void => {
    onPaidDone?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPaymentTab(initialTab);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("payment_title")}</DialogTitle>
          <DialogDescription>{t("payment_description", { orderCode: order.orderCode })}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              if (paymentTab !== "vnpay") {
                e.preventDefault();
                return;
              }
              void form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-4"
          >
            <div className="bg-muted space-y-2 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("order_code")}</span>
                <span className="text-sm">{order.orderCode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("wallet_credit_usd")}</span>
                <span className="text-sm font-bold">{formatPaymentCurrency(order.subtotalAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("payable_vnd")}</span>
                <span className="text-sm font-bold tabular-nums">{formatVndCheckoutAmount(payableVnd)}</span>
              </div>
            </div>

            <PaymentMethodTabs
              value={paymentTab}
              onValueChange={setPaymentTab}
              paypalEnabled={paypalEnabled}
              cassoLabel={t("tab_casso")}
              vnpayLabel={t("tab_vnpay")}
              paypalLabel={t("tab_paypal")}
              cassoPanel={
                <PaymentCassoPanel
                  hint={t("casso_qr_hint")}
                  loading={cassoLoading}
                  loadingLabel={t("processing")}
                  error={cassoError}
                  qrSrc={cassoQr}
                  cancelLabel={t("cancel")}
                  paidDoneLabel={t("paid_done")}
                  onCancel={() => onOpenChange(false)}
                  onPaidDone={handlePaidDone}
                />
              }
              vnpayPanel={
                <PaymentVnpayPanel
                  control={form.control}
                  isLoading={isLoading}
                  cancelLabel={t("cancel")}
                  payNowLabel={t("pay_now")}
                  processingLabel={t("processing")}
                  bankCodeLabel={t("bank_code")}
                  selectBankPlaceholder={t("select_bank")}
                  bankCodeDescription={t("bank_code_description")}
                  languageLabel={t("language")}
                  languageDescription={t("language_description")}
                  onCancel={() => onOpenChange(false)}
                />
              }
              paypalPanel={
                <PaymentPaypalPanel
                  active={paymentTab === "paypal"}
                  clientId={paypalClientId}
                  hint={t("paypal_hint")}
                  amountLabel={t("paypal_amount", { amount: formatPaymentCurrency(order.finalAmount) })}
                  loadingLabel={t("processing")}
                  errorLabel={t("paypal_error")}
                  unavailableLabel={t("paypal_unavailable")}
                  processingLabel={t("processing")}
                  cancelLabel={t("cancel")}
                  onCreateOrder={() => onPaypalCreateOrder(order.id)}
                  onApprove={async (paypalOrderId) => {
                    await onPaypalCapture(order.id, paypalOrderId);
                    toast({
                      title: t("payment_success"),
                      description: t("payment_success_description"),
                    });
                    handlePaidDone();
                  }}
                  onError={(message) => {
                    toast({ title: t("error"), description: message || t("paypal_error"), variant: "destructive" });
                  }}
                  onCancel={() => onOpenChange(false)}
                />
              }
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
