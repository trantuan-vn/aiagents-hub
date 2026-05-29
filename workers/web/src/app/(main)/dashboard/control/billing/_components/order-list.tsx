"use client";

import { useState } from "react";

import { Calendar, CreditCard, Package, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatUsd } from "@/lib/utils";

import { type PaymentMethodTab } from "./payment-dialog-constants";
import { PaymentDialog } from "./payment-dialog";
import { formatOrderDate, type Order, OrderStatus } from "./schema";

interface OrderListProps {
  orders: Order[];
  usdVndRate: number;
  onCancel: (orderId: number) => Promise<void>;
  onPayment: (orderId: number, amount: number, bankCode: string, language: string) => Promise<void>;
  onCassoQr: (orderId: number, amount: number) => Promise<{ qr: string }>;
  /** Optional: only used in non-readOnly mode where the PayPal pay button is shown. */
  onPaypalCreateOrder?: (orderId: number) => Promise<string>;
  onPaypalCapture?: (orderId: number, paypalOrderId: string) => Promise<void>;
  /** Runtime PayPal config (fetched from the backend). */
  paypalClientId?: string;
  paypalEnabled?: boolean;
  onPaidDone?: () => void;
  /** Read-only mode: không hiển thị nút thanh toán và hủy (dùng cho tab History) */
  readOnly?: boolean;
}

export function OrderList({
  orders,
  usdVndRate,
  onCancel,
  onPayment,
  onCassoQr,
  onPaypalCreateOrder = async () => {
    throw new Error("PayPal is not available");
  },
  onPaypalCapture = async () => {},
  paypalClientId = "",
  paypalEnabled = false,
  onPaidDone,
  readOnly = false,
}: OrderListProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentTab, setPaymentTab] = useState<PaymentMethodTab>("casso");
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);

  const getStatusBadgeVariant = (status: OrderStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "COMPLETED":
        return "default";
      case "PROCESSING":
      case "CONFIRMED":
        return "secondary";
      case "CANCELLED":
        return "destructive";
      case "PENDING":
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: OrderStatus): string => {
    const statusMap: Record<OrderStatus, string> = {
      PENDING: t("status.pending"),
      CONFIRMED: t("status.confirmed"),
      PROCESSING: t("status.processing"),
      COMPLETED: t("status.completed"),
      CANCELLED: t("status.cancelled"),
    };
    // eslint-disable-next-line security/detect-object-injection
    return statusMap[status] || status;
  };

  const canCancel = (status: OrderStatus): boolean => {
    return !["COMPLETED", "CANCELLED"].includes(status);
  };

  const canPay = (status: OrderStatus): boolean => {
    return status === "PENDING" || status === "CONFIRMED";
  };

  const handleCancel = async (orderId: number): Promise<void> => {
    setCancellingOrderId(orderId);
    try {
      await onCancel(orderId);
      toast({
        title: t("order_cancelled"),
        description: t("order_cancelled_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("cancel_error"),
        variant: "destructive",
      });
    } finally {
      setCancellingOrderId(null);
    }
  };

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-center">{t("no_orders")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("orders")}</CardTitle>
              <CardDescription>{t("orders_description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-muted/50 flex flex-col gap-4 rounded-lg p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                      <Package className="text-primary h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium">{order.orderCode}</span>
                        <Badge variant={getStatusBadgeVariant(order.status)} className="text-xs">
                          {getStatusLabel(order.status)}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatOrderDate(order.createdAt)}
                        </div>
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          {formatUsd(order.finalAmount)}
                        </div>
                        {order.appliedVoucherCode && (
                          <div className="text-muted-foreground text-xs">
                            {t("voucher")}: {order.appliedVoucherCode}
                          </div>
                        )}
                      </div>
                      {order.notes && <p className="text-muted-foreground mt-1 text-xs">{order.notes}</p>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!readOnly && canPay(order.status) && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setPaymentTab("casso");
                          setSelectedOrder(order);
                        }}
                        className="flex items-center gap-1"
                      >
                        <CreditCard className="h-4 w-4" />
                        {t("pay_with_vnd")}
                      </Button>
                      {paypalEnabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPaymentTab("paypal");
                            setSelectedOrder(order);
                          }}
                          className="flex items-center gap-1"
                        >
                          <CreditCard className="h-4 w-4" />
                          {t("pay_with_paypal")}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled className="flex items-center gap-1">
                          <CreditCard className="h-4 w-4" />
                          {t("pay_with_usd_coming_soon")}
                        </Button>
                      )}
                    </>
                  )}
                  {!readOnly && canCancel(order.status) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={cancellingOrderId === order.id}>
                          <X className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("cancel_order_confirm_title")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("cancel_order_confirm_description", { orderCode: order.orderCode })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleCancel(order.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t("confirm_cancel")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedOrder && (
        <PaymentDialog
          order={selectedOrder}
          usdVndRate={usdVndRate}
          open={!!selectedOrder}
          initialTab={paymentTab}
          onOpenChange={(open) => !open && setSelectedOrder(null)}
          onCassoQr={onCassoQr}
          onPaypalCreateOrder={onPaypalCreateOrder}
          onPaypalCapture={onPaypalCapture}
          paypalClientId={paypalClientId}
          paypalEnabled={paypalEnabled}
          onPaidDone={onPaidDone}
          onPayment={async (orderId, amount, bankCode, language) => {
            await onPayment(orderId, amount, bankCode, language);
            setSelectedOrder(null);
          }}
        />
      )}
    </>
  );
}
