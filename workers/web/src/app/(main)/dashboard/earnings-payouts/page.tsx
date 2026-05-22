"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { useRequireAdmin } from "../_hooks/use-require-admin";

import { EarningsPayoutQrDialog } from "./_components/earnings-payout-qr-dialog";
import { EarningsPayoutTable, type PayoutItem } from "./_components/earnings-payout-table";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export default function EarningsPayoutsPage() {
  const t = useTranslations("EarningsPayoutsPage");
  const { toast } = useToast();
  const isAdmin = useRequireAdmin();
  const [items, setItems] = useState<PayoutItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PayoutItem | null>(null);

  const tableLabels = useMemo(
    () => ({
      user: t("user"),
      period: t("period"),
      commission: t("commission"),
      workflow: t("workflow"),
      total: t("total"),
      beneficiary: t("beneficiary"),
      bank_status: t("bank_status"),
      actions: t("actions"),
      configured: t("configured"),
      missing: t("missing"),
      bank_paid: t("bank_paid"),
      bank_unpaid: t("bank_unpaid"),
      show_qr: t("show_qr"),
    }),
    [t],
  );

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/earnings-payouts/list`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(await res.text());
      const data: { items?: PayoutItem[] } = await res.json();
      setItems(data.items ?? []);
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("load_error"),
        variant: "destructive",
      });
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (isAdmin) void fetchList();
  }, [fetchList, isAdmin]);

  const openQr = async (item: PayoutItem) => {
    setSelectedItem(item);
    setQrOpen(true);
    setQrLoading(true);
    setQrError(null);
    setQrSrc(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/earnings-payouts/qr`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: item.recipientUserId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: { qr?: string } = await res.json();
      setQrSrc(data.qr ?? null);
    } catch (e) {
      setQrError(e instanceof Error ? e.message : t("qr_error"));
    } finally {
      setQrLoading(false);
    }
  };

  const handleQrPaid = () => {
    setQrOpen(false);
    void fetchList();
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("page_title")}</h1>
          <p className="text-muted-foreground">{t("page_description")}</p>
        </div>
        <Button variant="outline" onClick={() => void fetchList()} disabled={isLoading}>
          {t("refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("table_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-muted-foreground flex min-h-[200px] items-center justify-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("loading")}
            </div>
          )}
          {!isLoading && items.length === 0 && <p className="text-muted-foreground text-sm">{t("no_items")}</p>}
          {!isLoading && items.length > 0 && (
            <EarningsPayoutTable
              items={items}
              labels={tableLabels}
              onShowQr={(item) => void openQr(item)}
            />
          )}
        </CardContent>
      </Card>

      <EarningsPayoutQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        selectedItem={selectedItem}
        qrLoading={qrLoading}
        qrError={qrError}
        qrSrc={qrSrc}
        title={t("qr_dialog_title")}
        hint={t("qr_hint")}
        cancelLabel={t("cancel")}
        paidLabel={t("confirm_paid")}
        onPaid={handleQrPaid}
      />
    </div>
  );
}
