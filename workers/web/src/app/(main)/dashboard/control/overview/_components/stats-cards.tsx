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
    gradient: "from-blue-500 via-cyan-500 to-teal-500",
    bgGlow: "bg-blue-500/20",
    accent: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "active_subscriptions",
    fn: (s: OverviewStats) => s.activeSubscriptions.toString(),
    icon: Zap,
    gradient: "from-primary via-primary/90 to-accent",
    bgGlow: "bg-primary/20",
    accent: "text-primary",
  },
  {
    key: "active_tokens",
    fn: (s: OverviewStats) => s.activeTokens.toString(),
    icon: Key,
    gradient: "from-emerald-500 via-green-500 to-teal-600",
    bgGlow: "bg-emerald-500/20",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
] as const;

export function StatsCards({ stats, t }: StatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STATS_CONFIG.map(({ key, fn, icon: Icon, gradient, bgGlow, accent }) => (
        <Card
          key={key}
          className="hover:shadow-primary/5 group relative overflow-hidden border transition-all duration-300 hover:shadow-lg"
        >
          <div
            className={`absolute -top-12 -right-12 h-24 w-24 rounded-full ${bgGlow} opacity-50 blur-2xl transition-opacity group-hover:opacity-70`}
          />
          <CardContent className="relative p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground mb-1.5 text-sm font-medium">{t(`stats.${key}`)}</p>
                <p className={`text-3xl font-bold tracking-tight tabular-nums ${accent}`}>{fn(stats)}</p>
              </div>
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg transition-transform duration-300 group-hover:scale-110`}
              >
                <Icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
