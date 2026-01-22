"use client";

import { useEffect, useState } from "react";

import { useSearchParams, useRouter } from "next/navigation";

import { AlertCircle, CreditCard, Package, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { CreateOrderDialog } from "./_components/create-order-dialog";
import { OrderList } from "./_components/order-list";
import type { CreateOrder, Order } from "./_components/schema";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export default function BillingPage() {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status] = useState<string | undefined>(undefined);
  const [targetType] = useState<"SERVICE" | "USER" | undefined>(undefined);
  const [page] = useState(1);
  const [limit] = useState(20);

  const fetchOrders = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (targetType) params.append("targetType", targetType);
      params.append("page", page.toString());
      params.append("limit", limit.toString());

      const url = `${API_BASE_URL}/dashboard/order/orders${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("fetch_error"));
      }

      const data: Order[] = await response.json();
      setOrders(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, targetType, page, limit]);

  // Xử lý kết quả thanh toán từ VNPay return
  useEffect(() => {
    const paymentResult = searchParams.get("payment_result");
    if (paymentResult) {
      const message = searchParams.get("message");

      if (paymentResult === "success") {
        toast({
          title: t("payment_success"),
          description: message ?? t("payment_success_description"),
          variant: "default",
        });
      } else {
        toast({
          title: t("payment_failed"),
          description: message ?? t("payment_failed_description"),
          variant: "destructive",
        });
      }

      // Refresh danh sách orders
      void fetchOrders();

      // Xóa query params sau khi xử lý
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete("payment_result");
      newSearchParams.delete("code");
      newSearchParams.delete("message");
      newSearchParams.delete("orderId");
      newSearchParams.delete("amount");
      newSearchParams.delete("transactionNo");
      newSearchParams.delete("bankCode");

      const newUrl = newSearchParams.toString() ? `?${newSearchParams.toString()}` : "";
      router.replace(`/dashboard/control/billing${newUrl}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const handleCreateOrder = async (data: CreateOrder): Promise<unknown> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/order/orders`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("create_error"));
    }

    const result = await response.json();
    void fetchOrders(); // Refresh the list
    return result;
  };

  const handleCancelOrder = async (orderId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/order/orders/${orderId}/cancel`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("cancel_error"));
    }

    void fetchOrders(); // Refresh the list
  };

  const handlePayment = async (orderId: number, amount: number, bankCode: string, language: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/vnpay/create_payment_url`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          amount,
          bankCode,
          language,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("payment_error"));
      }

      const result: unknown = await response.json();
      if (result && typeof result === "object" && "paymentUrl" in result && typeof result.paymentUrl === "string") {
        window.location.href = result.paymentUrl;
      } else {
        throw new Error(t("payment_url_error"));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("payment_error");
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
      throw err;
    }
  };

  const pendingOrders = orders.filter((o) => o.status === "PENDING");
  const totalAmount = orders.reduce((sum, o) => sum + o.finalAmount, 0);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreateOrderDialog onCreate={handleCreateOrder} />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_orders")}</CardTitle>
            <Package className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_orders_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.pending_orders")}</CardTitle>
            <Receipt className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.pending_orders_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_amount")}</CardTitle>
            <CreditCard className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat("vi-VN", {
                style: "currency",
                currency: "VND",
              }).format(totalAmount)}
            </div>
            <p className="text-muted-foreground text-xs">{t("stats.total_amount_description")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Order List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <OrderList orders={orders} onCancel={handleCancelOrder} onPayment={handlePayment} />
      )}
    </div>
  );
}
