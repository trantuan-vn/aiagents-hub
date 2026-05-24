"use client";

import { useEffect, useState } from "react";

import { Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { API_BASE_URL } from "@/app/(main)/dashboard/control/billing/_components/billing-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TierConfig = {
  tier: string;
  label: string;
  minVnd: number;
  maxVndExclusive?: number;
  description?: string;
};

type TierConfigsResponse = {
  tiers?: TierConfig[];
};

function parseTierConfigs(json: unknown): TierConfig[] {
  if (!json || typeof json !== "object" || !("tiers" in json)) return [];
  const tiers = (json as TierConfigsResponse).tiers;
  return Array.isArray(tiers) ? tiers : [];
}

export default function UserGroupsPage() {
  const t = useTranslations("UserGroupsPage");
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/admin/membership-tier/configs`, {
          credentials: "include",
        });
        if (res.ok) {
          const json: unknown = await res.json();
          setTiers(parseTierConfigs(json));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
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
            <ul className="space-y-3">
              {tiers.map((tier) => (
                <li key={tier.tier} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
                  <span>
                    <p className="font-medium">{tier.label}</p>
                    <p className="text-muted-foreground text-sm">{tier.description}</p>
                  </span>
                  <Badge variant="secondary">{tier.tier}</Badge>
                </li>
              ))}
            </ul>
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
