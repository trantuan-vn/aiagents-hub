"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import { CreatePaymentSchema, type CreatePayment, type Order } from "./schema";

interface PaymentDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (orderId: number, amount: number, bankCode: string, language: string) => Promise<void>;
  onCassoQr: (orderId: number, amount: number) => Promise<{ qr: string }>;
  onPaidDone?: () => void;
}

const BANK_CODES = [
  { value: "VNPAYQR", label: "Thanh toán quét mã QR" },
  { value: "VNBANK", label: "Thẻ ATM - Tài khoản ngân hàng nội địa" },
  { value: "INTCARD", label: "Thẻ thanh toán quốc tế" },
];

/** Bật khi set `NEXT_PUBLIC_ENABLE_VNPAY_BILLING=true` (VNPay production). */
const IS_VNPAY_PAYMENT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_VNPAY_BILLING === "true";

export function PaymentDialog({
  order,
  open,
  onOpenChange,
  onPayment,
  onCassoQr,
  onPaidDone,
}: PaymentDialogProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"vnpay" | "casso">("casso");
  const [cassoQr, setCassoQr] = useState<string | null>(null);
  const [cassoLoading, setCassoLoading] = useState(false);
  const [cassoError, setCassoError] = useState<string | null>(null);

  const form = useForm<CreatePayment>({
    resolver: zodResolver(CreatePaymentSchema) as Resolver<CreatePayment>,
    defaultValues: {
      orderId: order.id,
      amount: order.finalAmount,
      bankCode: "",
      language: "vn",
    },
  });

  const watchedAmount = form.watch("amount");

  useEffect(() => {
    if (!open) {
      setPaymentTab("casso");
      setCassoQr(null);
      setCassoError(null);
      setCassoLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || paymentTab !== "casso") {
      return;
    }
    let cancelled = false;
    setCassoLoading(true);
    setCassoError(null);
    setCassoQr(null);
    const amount = typeof watchedAmount === "number" && !Number.isNaN(watchedAmount) ? watchedAmount : order.finalAmount;
    void onCassoQr(order.id, amount)
      .then((res) => {
        if (!cancelled) {
          setCassoQr(res.qr);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : t("casso_qr_error");
          setCassoError(message);
          toast({
            title: t("error"),
            description: message,
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCassoLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, paymentTab, watchedAmount, order.id, onCassoQr, order.finalAmount, t, toast]);

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

  const formatCurrency = (amount: number, currency: string = "VND"): string => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const handlePaidDone = (): void => {
    onPaidDone?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                <span className="text-sm font-medium">{t("amount")}</span>
                <span className="text-sm font-bold">{formatCurrency(order.finalAmount, order.currency)}</span>
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
                      placeholder={order.finalAmount.toString()}
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || order.finalAmount)}
                    />
                  </FormControl>
                  <FormDescription>{t("payment_amount_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Tabs
              value={paymentTab}
              onValueChange={(v) => {
                const next = v as "vnpay" | "casso";
                if (next === "vnpay" && !IS_VNPAY_PAYMENT_ENABLED) return;
                setPaymentTab(next);
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="casso">{t("tab_casso")}</TabsTrigger>
                <TabsTrigger value="vnpay" disabled={!IS_VNPAY_PAYMENT_ENABLED}>
                  {t("tab_vnpay")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="casso" className="mt-4 space-y-4">
                <p className="text-muted-foreground text-sm">{t("casso_qr_hint")}</p>
                <div className="bg-muted flex min-h-[220px] items-center justify-center rounded-lg border p-4">
                  {cassoLoading && (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground text-sm">{t("processing")}</span>
                    </div>
                  )}
                  {!cassoLoading && cassoError && (
                    <p className="text-destructive text-center text-sm">{cassoError}</p>
                  )}
                  {!cassoLoading && !cassoError && cassoQr && (
                    <img src={cassoQr} alt="" className="max-h-[280px] max-w-full object-contain" />
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {t("cancel")}
                  </Button>
                  <Button type="button" onClick={handlePaidDone}>
                    {t("paid_done")}
                  </Button>
                </DialogFooter>
              </TabsContent>

              <TabsContent value="vnpay" className="mt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="bankCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("bank_code")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("select_bank")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BANK_CODES.map((bank) => (
                            <SelectItem key={bank.value} value={bank.value}>
                              {bank.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t("bank_code_description")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("language")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vn">Tiếng Việt</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>{t("language_description")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {t("cancel")}
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("processing")}
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        {t("pay_now")}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
