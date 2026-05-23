"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { PaymentCassoPanel } from "./payment-casso-panel";
import { formatPaymentCurrency, type PaymentMethodTab } from "./payment-dialog-constants";
import { PaymentMethodTabs } from "./payment-method-tabs";
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
  onPaidDone?: () => void;
}

export function PaymentDialog({
  order,
  usdVndRate,
  open,
  onOpenChange,
  onPayment,
  onCassoQr,
  onPaidDone,
}: PaymentDialogProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentTab, setPaymentTab] = useState<PaymentMethodTab>("casso");

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

  const watchedAmount = form.watch("amount");
  const { cassoQr, cassoLoading, cassoError } = useCassoQr({
    open,
    paymentTab,
    orderId: order.id,
    orderPayableVnd: payableVnd,
    watchedAmount,
    onCassoQr,
  });

  const onSubmit = async (data: CreatePayment): Promise<void> => {
    setIsLoading(true);
    try {
      await onPayment(data.orderId, data.amount, data.bankCode, data.language);
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
          setPaymentTab("casso");
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
                <span className="text-sm font-bold">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(
                    order.finalAmount,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("payable_vnd")}</span>
                <span className="text-sm font-bold">{formatPaymentCurrency(payableVnd, "VND")}</span>
              </div>
            </div>

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("payment_amount")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1000}
                      placeholder={payableVnd.toString()}
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || payableVnd)}
                    />
                  </FormControl>
                  <FormDescription>{t("payment_amount_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PaymentMethodTabs
              value={paymentTab}
              onValueChange={setPaymentTab}
              cassoLabel={t("tab_casso")}
              vnpayLabel={t("tab_vnpay")}
              stripeLabel={t("tab_stripe")}
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
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
