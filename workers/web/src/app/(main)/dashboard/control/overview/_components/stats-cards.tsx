"use client";

import { Activity, Key, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

interface OverviewStats {
  totalApiCalls: number;
  activeSubscriptions: number;
  activeTokens: number;
}

interface StatsCardsProps {
  stats: OverviewStats;
  t: (key: string) => string;
}

const STATS_CONFIG = [
  {
    key: "total_api_calls",
    fn: (s: OverviewStats) => formatCompactNumber(s.totalApiCalls),
    icon: Activity,
    color: "from-blue-500 to-cyan-500",
  },
  {
    key: "active_subscriptions",
    fn: (s: OverviewStats) => s.activeSubscriptions.toString(),
    icon: Zap,
    color: "from-primary to-primary/70",
  },
  {
    key: "active_tokens",
    fn: (s: OverviewStats) => s.activeTokens.toString(),
    icon: Key,
    color: "from-green-500 to-emerald-500",
  },
] as const;

export function StatsCards({ stats, t }: StatsCardsProps) {
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-3">
      {STATS_CONFIG.map(({ key, fn, icon: Icon, color }) => (
        <Card key={key}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground mb-1 text-sm">{t(`stats.${key}`)}</p>
                <p className="text-2xl font-bold">{fn(stats)}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${color}`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
