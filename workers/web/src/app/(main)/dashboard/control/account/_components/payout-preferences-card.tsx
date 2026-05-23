"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function PayoutPreferencesCard() {
  const t = useTranslations("AccountPage.payout_preferences");
  const { toast } = useToast();
  const [currency, setCurrency] = useState<"VND" | "USD">("VND");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/profile/me`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data: { earningsPayoutCurrency?: string } = await res.json();
      setCurrency(data.earningsPayoutCurrency === "USD" ? "USD" : "VND");
    } catch {
      setCurrency("VND");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onChange = async (value: "VND" | "USD") => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/profile/payout-preferences`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ earningsPayoutCurrency: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCurrency(value);
      toast({ title: t("saved") });
    } catch (e) {
      toast({
        title: t("error"),
        description: e instanceof Error ? e.message : t("save_error"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="max-w-sm">
        <Label>{t("currency_label")}</Label>
        <Select
          value={currency}
          disabled={loading || saving}
          onValueChange={(v) => void onChange(v === "USD" ? "USD" : "VND")}
        >
          <SelectTrigger className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VND">{t("currency_vnd")}</SelectItem>
            <SelectItem value="USD">{t("currency_usd")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-2 text-xs">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
