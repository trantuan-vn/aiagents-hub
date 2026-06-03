"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import { useToast } from "@/hooks/use-toast";

import type { PayoutItem } from "./earnings-payout-table";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function useEarningsPayoutsPage(isAdmin: boolean) {
  const t = useTranslations("EarningsPayoutsPage");
  const { toast } = useToast();
  const [items, setItems] = useState<PayoutItem[]>([]);
  const [accruingItems, setAccruingItems] = useState<PayoutItem[]>([]);
  const [accruingPeriod, setAccruingPeriod] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PayoutItem | null>(null);
  const [paypalOpen, setPaypalOpen] = useState(false);
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [paypalSuccess, setPaypalSuccess] = useState(false);

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
      pay_usd: t("pay_usd"),
      payout_currency: t("payout_currency"),
      accruing_status: t("accruing_status"),
    }),
    [t],
  );

  const accruingTableLabels = useMemo(() => ({ ...tableLabels, total: t("accruing_total") }), [tableLabels, t]);

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/earnings-payouts/list`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(await res.text());
      const data: {
        items?: PayoutItem[];
        accruingItems?: PayoutItem[];
        accruingPeriod?: string;
      } = await res.json();
      setItems(data.items ?? []);
      setAccruingItems(data.accruingItems ?? []);
      setAccruingPeriod(data.accruingPeriod ?? null);
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("load_error"),
        variant: "destructive",
      });
      setItems([]);
      setAccruingItems([]);
      setAccruingPeriod(null);
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

  const openPaypal = (item: PayoutItem) => {
    setSelectedItem(item);
    setPaypalOpen(true);
    setPaypalLoading(false);
    setPaypalError(null);
    setPaypalSuccess(false);
  };

  const confirmPaypal = async () => {
    if (!selectedItem) return;
    setPaypalLoading(true);
    setPaypalError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/earnings-payouts/paypal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: selectedItem.recipientUserId }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        let message = errBody;
        try {
          const parsed = JSON.parse(errBody) as { message?: string; error?: string };
          message = parsed.message ?? parsed.error ?? errBody;
        } catch {
          /* use raw body */
        }
        throw new Error(message || t("paypal_error"));
      }
      setPaypalSuccess(true);
      toast({ title: t("paypal_success") });
      void fetchList();
    } catch (e) {
      setPaypalError(e instanceof Error ? e.message : t("paypal_error"));
    } finally {
      setPaypalLoading(false);
    }
  };

  const handleQrPaid = () => {
    setQrOpen(false);
    void fetchList();
  };

  const handlePaypalClose = (open: boolean) => {
    setPaypalOpen(open);
    if (!open) {
      setPaypalSuccess(false);
      setPaypalError(null);
    }
  };

  const accruingTitle = accruingPeriod
    ? t("accruing_table_title", { period: accruingPeriod })
    : t("accruing_table_title_fallback");

  return {
    t,
    items,
    accruingItems,
    isLoading,
    tableLabels,
    accruingTableLabels,
    accruingTitle,
    fetchList,
    openQr,
    openPaypal,
    qr: {
      open: qrOpen,
      setOpen: setQrOpen,
      src: qrSrc,
      loading: qrLoading,
      error: qrError,
      selectedItem,
      onPaid: handleQrPaid,
    },
    paypal: {
      open: paypalOpen,
      setOpen: handlePaypalClose,
      loading: paypalLoading,
      error: paypalError,
      success: paypalSuccess,
      selectedItem,
      onConfirm: () => void confirmPaypal(),
    },
  };
}
