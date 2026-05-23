"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils";

import type { AdminCrmStats } from "../page";

function maskIdentifier(id: string): string {
  if (!id || id.length < 8) return id;
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

interface CrmDataTablesProps {
  stats: AdminCrmStats;
}

export function CrmDataTables({ stats }: CrmDataTablesProps) {
  const t = useTranslations("CRM");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Top Referrers */}
      <Card>
        <CardHeader>
          <CardTitle>{t("top_referrers")}</CardTitle>
          <CardDescription>{t("top_referrers_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.topReferrers.length > 0 ? (
            <div className="space-y-3">
              {stats.topReferrers.map((ref, idx) => (
                <div key={ref.referrerId} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full text-sm font-medium">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-sm">{maskIdentifier(ref.referrerId)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-muted-foreground text-sm">
                      {ref.referredCount} {t("referred")}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatUsd(ref.commissionAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-24 items-center justify-center rounded-lg border border-dashed text-sm">
              {t("no_data")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Referred Users */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recent_referred_users")}</CardTitle>
          <CardDescription>{t("recent_referred_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentReferredUsers.length > 0 ? (
            <div className="space-y-2">
              {stats.recentReferredUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-sm">{maskIdentifier(user.identifier)}</span>
                    <span className="text-muted-foreground text-xs">
                      {t("referred_by")} {maskIdentifier(user.referrerId)}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs tabular-nums">{user.createdAt}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-24 items-center justify-center rounded-lg border border-dashed text-sm">
              {t("no_data")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visitors by Country - full width */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("visitors_by_country")}</CardTitle>
          <CardDescription>{t("visitors_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.visitorsByCountry.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {stats.visitorsByCountry.map((row) => (
                <div key={row.country} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <span className="font-medium">{row.country === "XX" ? "Unknown" : row.country}</span>
                  <span className="tabular-nums">{row.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-20 items-center justify-center rounded-lg border border-dashed text-sm">
              {t("no_data")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
