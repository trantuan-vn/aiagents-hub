"use client";

import { useCallback, useEffect, useState } from "react";

import { Save, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { API_BASE_URL } from "@/app/(main)/dashboard/control/billing/_components/billing-api";
import { formatVndCheckoutAmount } from "@/app/(main)/dashboard/control/billing/_components/payment-dialog-constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type TierConfig = {
  tier: string;
  label: string;
  minVnd: number;
  maxVndExclusive?: number;
  description?: string;
};

type TierThresholds = {
  silver: number;
  gold: number;
  diamond: number;
};

type TierConfigsResponse = {
  tiers?: TierConfig[];
  thresholds?: TierThresholds;
};

const EDITABLE_TIERS = ["silver", "gold", "diamond"] as const;

const DEFAULT_THRESHOLDS: TierThresholds = {
  silver: 500_000,
  gold: 20_000_000,
  diamond: 50_000_000,
};

function findTierMinVnd(tiers: TierConfig[], tierName: string, fallback: number): number {
  return tiers.find((t) => t.tier === tierName)?.minVnd ?? fallback;
}

function thresholdsFromTiers(tiers: TierConfig[]): TierThresholds {
  return {
    silver: findTierMinVnd(tiers, "silver", DEFAULT_THRESHOLDS.silver),
    gold: findTierMinVnd(tiers, "gold", DEFAULT_THRESHOLDS.gold),
    diamond: findTierMinVnd(tiers, "diamond", DEFAULT_THRESHOLDS.diamond),
  };
}

function parseTierConfigs(json: unknown): { tiers: TierConfig[]; thresholds: TierThresholds } {
  if (!json || typeof json !== "object") {
    return { tiers: [], thresholds: DEFAULT_THRESHOLDS };
  }
  const data = json as TierConfigsResponse;
  const tiers = Array.isArray(data.tiers) ? data.tiers : [];
  const thresholds = data.thresholds ?? thresholdsFromTiers(tiers);
  return { tiers, thresholds };
}

function parseErrorResponse(data: unknown, defaultMsg: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: string }).error;
    return typeof err === "string" ? err : defaultMsg;
  }
  return defaultMsg;
}

export default function UserGroupsPage() {
  const t = useTranslations("UserGroupsPage");
  const { toast } = useToast();
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [thresholds, setThresholds] = useState<TierThresholds>({
    silver: 500_000,
    gold: 20_000_000,
    diamond: 50_000_000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/membership-tier/configs`, {
        credentials: "include",
      });
      if (res.ok) {
        const json: unknown = await res.json();
        const parsed = parseTierConfigs(json);
        setTiers(parsed.tiers);
        setThresholds(parsed.thresholds);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const handleThresholdChange = (tier: keyof TierThresholds, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const value = digits === "" ? 0 : Number.parseInt(digits, 10);
    setThresholds((prev) => ({ ...prev, [tier]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/membership-tier/configs`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(parseErrorResponse(data, t("save_error")));
      }
      const parsed = parseTierConfigs(data);
      setTiers(parsed.tiers);
      setThresholds(parsed.thresholds);
      toast({ title: t("save_success"), description: t("save_success_description") });
    } catch (error) {
      toast({
        title: t("save_error"),
        description: error instanceof Error ? error.message : t("save_error"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const memberTier = tiers.find((tier) => tier.tier === "member");

  return (
    <section className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="h-6 w-6" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
        </div>
        <Button onClick={() => void handleSave()} disabled={loading || saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? t("saving") : t("save")}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("tier_rules")}</CardTitle>
          <CardDescription>{t("tier_rules_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("loading")}</p>
          ) : (
            <div className="space-y-4">
              {memberTier && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{memberTier.label}</p>
                    <p className="text-muted-foreground text-sm">{memberTier.description}</p>
                  </div>
                  <p className="text-muted-foreground text-sm tabular-nums">{formatVndCheckoutAmount(0)}</p>
                </div>
              )}

              {EDITABLE_TIERS.map((tierKey) => {
                const tierInfo = tiers.find((tier) => tier.tier === tierKey);
                return (
                  <div key={tierKey} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{tierInfo?.label ?? tierKey}</p>
                      <p className="text-muted-foreground text-sm">{tierInfo?.description}</p>
                    </div>
                    <div className="w-full sm:w-56">
                      <Label htmlFor={`threshold-${tierKey}`} className="sr-only">
                        {t("min_top_up_label", { tier: tierInfo?.label ?? tierKey })}
                      </Label>
                      <Input
                        id={`threshold-${tierKey}`}
                        inputMode="numeric"
                        value={thresholds[tierKey] > 0 ? String(thresholds[tierKey]) : ""}
                        onChange={(e) => handleThresholdChange(tierKey, e.target.value)}
                        placeholder={t("min_top_up_placeholder")}
                      />
                      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                        {formatVndCheckoutAmount(thresholds[tierKey])}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("downgrade_rule")}</CardTitle>
          <CardDescription>{t("downgrade_rule_description")}</CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}
