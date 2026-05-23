"use client";

import { useEffect, useState } from "react";

import { useSearchParams, useRouter } from "next/navigation";

import { AlertCircle, History, Package } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import {
  FALLBACK_MIN_TOP_UP_VND,
  FALLBACK_USD_VND,
  fetchMemberBillingParams,
  fetchOrdersList,
  fetchWalletBalance,
  loadHistoryFromApi,
  postCancelOrder,
  postCreateOrder,
  requestCassoQr,
  requestVnpayPaymentUrl,
} from "./_components/billing-api";
import { BillingStatsCards } from "./_components/billing-stats-cards";
import { OrderHistoryTab, getPresetDateRange } from "./_components/order-history-tab";
import { OrderList } from "./_components/order-list";
import type { CreateOrder, Order } from "./_components/schema";
import { WalletTopUpDialog } from "./_components/wallet-top-up-dialog";

export default function BillingPage() {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [walletBalanceUsd, setWalletBalanceUsd] = useState(0);
  const [usdVndRate, setUsdVndRate] = useState(FALLBACK_USD_VND);
  const [minTopUpVnd, setMinTopUpVnd] = useState(FALLBACK_MIN_TOP_UP_VND);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status] = useState<string | undefined>(undefined);
  const [page] = useState(1);
  const [limit] = useState(20);

  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyLimit = 50;

  const [datePreset, setDatePreset] = useState<"all" | "7d" | "30d" | "month" | "custom">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [topUpOpen, setTopUpOpen] = useState(false);

  const fetchHistory = async (
    offset = 0,
    append = false,
    dateParams?: { fromDate: string; toDate: string },
  ): Promise<void> => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await loadHistoryFromApi(historyLimit, offset, dateParams);
      setHistoryOrders(append ? (prev) => [...prev, ...data.orders] : data.orders);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setHistoryError(errorMessage);
      toast({ title: t("error"), description: errorMessage, variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const refreshBillingParams = (): void => {
    void fetchMemberBillingParams().then((p) => {
      setUsdVndRate(p.usdVndRate);
      setMinTopUpVnd(p.minTopUpVnd);
    });
  };

  const fetchOrders = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOrdersList({ status, page, limit, fetchErrorFallback: t("fetch_error") });
      setOrders(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      toast({ title: t("error"), description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
    void fetchWalletBalance().then(setWalletBalanceUsd);
    refreshBillingParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, limit]);

  // Mở dialog nạp tiền khi điều hướng từ overview (?topup=1)
  useEffect(() => {
    if (searchParams.get("topup") !== "1") return;

    setTopUpOpen(true);

    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete("topup");
    const newUrl = newSearchParams.toString() ? `?${newSearchParams.toString()}` : "";
    router.replace(`/dashboard/control/billing${newUrl}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      void fetchWalletBalance().then(setWalletBalanceUsd);
      refreshBillingParams();

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
    const result = await postCreateOrder(data, t("create_error"));
    void fetchOrders();
    void fetchWalletBalance().then(setWalletBalanceUsd);
    refreshBillingParams();
    return result;
  };

  const handleCancelOrder = async (orderId: number): Promise<void> => {
    await postCancelOrder(orderId, t("cancel_error"));
    void fetchOrders();
  };

  const handlePayment = async (orderId: number, amount: number, bankCode: string, language: string): Promise<void> => {
    try {
      window.location.href = await requestVnpayPaymentUrl(
        orderId,
        amount,
        bankCode,
        language,
        t("payment_error"),
        t("payment_url_error"),
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("payment_error");
      toast({ title: t("error"), description: errorMessage, variant: "destructive" });
      throw err;
    }
  };

  const handleCassoQr = (orderId: number, amount: number): Promise<{ qr: string }> =>
    requestCassoQr(orderId, amount, t("payment_error"), t("casso_qr_error"));

  const handleBillingRefresh = (): void => {
    void fetchOrders();
    void fetchWalletBalance().then(setWalletBalanceUsd);
    refreshBillingParams();
  };

  const pendingOrders = orders.filter((o) => o.status === "PENDING");

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <WalletTopUpDialog
          onCreate={handleCreateOrder}
          usdVndRate={usdVndRate}
          minTopUpVnd={minTopUpVnd}
          open={topUpOpen}
          onOpenChange={setTopUpOpen}
        />
      </div>

      <BillingStatsCards
        walletBalanceUsd={walletBalanceUsd}
        pendingTopUps={pendingOrders.length}
        completedVolumeVnd={orders.filter((o) => o.status === "COMPLETED").reduce((s, o) => s + o.finalAmount, 0)}
        usdVndRate={usdVndRate}
      />

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Order List với Tabs: Orders | History */}
      <Tabs
        defaultValue="orders"
        className="space-y-4"
        onValueChange={(v) => {
          if (v !== "history" || historyLoading) return;
          let dateParams: { fromDate: string; toDate: string } | undefined;
          if (datePreset === "all") dateParams = undefined;
          else if (datePreset === "custom" && fromDate && toDate) dateParams = { fromDate, toDate };
          else if (datePreset !== "custom") dateParams = getPresetDateRange(datePreset);
          void fetchHistory(0, false, dateParams);
        }}
      >
        <TabsList className="border-border bg-muted/40 h-auto gap-1 rounded-lg border p-1">
          <TabsTrigger
            value="orders"
            className="border-border/70 data-[state=active]:border-primary data-[state=active]:bg-background gap-1.5 rounded-md border bg-background/60 data-[state=active]:shadow-sm"
          >
            <Package className="h-4 w-4" />
            {t("tab_orders")}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="border-border/70 data-[state=active]:border-primary data-[state=active]:bg-background gap-1.5 rounded-md border bg-background/60 data-[state=active]:shadow-sm"
          >
            <History className="h-4 w-4" />
            {t("tab_history")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">{t("loading")}</p>
              </CardContent>
            </Card>
          ) : (
            <OrderList
              orders={orders}
              onCancel={handleCancelOrder}
              onPayment={handlePayment}
              onCassoQr={handleCassoQr}
              onPaidDone={handleBillingRefresh}
            />
          )}
        </TabsContent>
        <TabsContent value="history">
          <OrderHistoryTab
            preset={datePreset}
            fromDate={fromDate}
            toDate={toDate}
            onPresetChange={setDatePreset}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onApply={(p) => void fetchHistory(0, false, p)}
            orders={historyOrders}
            loading={historyLoading}
            error={historyError}
            onCancel={handleCancelOrder}
            onPayment={handlePayment}
            onCassoQr={handleCassoQr}
            onPaidDone={handleBillingRefresh}
            t={t}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
