"use client";

import { useEffect, useState } from "react";

import { AlertCircle, Gift } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { CreateVoucherDialog } from "./_components/create-voucher-dialog";
import { type CreateVoucher, type Voucher } from "./_components/schema";
import { VoucherList } from "./_components/voucher-list";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export default function VoucherPage() {
  const t = useTranslations("VoucherPage");
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVouchers = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/voucher/vouchers`, {
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

      const data: Voucher[] = await response.json();
      setVouchers(data);
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
    void fetchVouchers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateVoucher = async (data: CreateVoucher): Promise<Voucher> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/voucher/vouchers`, {
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
    void fetchVouchers(); // Refresh the list
    return result as Voucher;
  };

  const handleDeleteVoucher = async (voucherId: string | number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/voucher/vouchers/${voucherId}/status`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "INACTIVE" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("delete_error"));
    }

    void fetchVouchers(); // Refresh the list
  };

  const activeVouchers = vouchers.filter((v) => v.status === "ACTIVE");
  const totalUsage = vouchers.reduce((sum, v) => sum + (v.usedCount || 0), 0);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreateVoucherDialog onCreate={handleCreateVoucher} />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_vouchers")}</CardTitle>
            <Gift className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vouchers.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_vouchers_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.active_vouchers")}</CardTitle>
            <Gift className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeVouchers.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.active_vouchers_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_usage")}</CardTitle>
            <AlertCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsage.toLocaleString()}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_usage_description")}</p>
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

      {/* Voucher List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <VoucherList vouchers={vouchers} onDelete={handleDeleteVoucher} />
      )}
    </div>
  );
}
