"use client";

import Link from "next/link";

import { ChevronRight, Package, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Subscription {
  id: number;
  name: string;
  plan?: string;
  calls: number;
  limit: number;
  nextBilling?: string | null;
}

interface SubscriptionsCardProps {
  subscriptions: Subscription[];
  t: (key: string) => string;
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-amber-500";
  return "bg-primary";
}

export function SubscriptionsCard({ subscriptions, t }: SubscriptionsCardProps) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="text-primary h-5 w-5" />
              {t("subscriptions.title")}
            </CardTitle>
            <CardDescription>{t("subscriptions.description")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/packages" className="gap-1">
              {t("subscriptions.view_all")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12">
            <div className="bg-muted/50 mb-4 flex h-14 w-14 items-center justify-center rounded-full">
              <Package className="text-muted-foreground h-7 w-7" />
            </div>
            <p className="text-muted-foreground mb-2 font-medium">{t("no_subscriptions")}</p>
            <Button asChild>
              <Link href="/packages">
                <TrendingUp className="mr-2 h-4 w-4" />
                {t("subscriptions.explore")}
              </Link>
            </Button>
          </div>
        ) : (
          subscriptions.map((sub) => {
            const percent = sub.limit > 0 ? Math.min(100, (sub.calls / sub.limit) * 100) : 0;
            return (
              <div key={sub.id} className="group bg-muted/30 hover:bg-muted/50 rounded-xl border p-4 transition-all">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold">{sub.name}</h4>
                    <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-sm">
                      {sub.plan && (
                        <span>
                          {sub.plan} {t("subscriptions.plan")}
                        </span>
                      )}
                      {sub.nextBilling && (
                        <span>
                          • {t("subscriptions.renews")} {sub.nextBilling}
                        </span>
                      )}
                    </p>
                  </div>
                  {sub.plan && (
                    <Badge variant="secondary" className="shrink-0">
                      {sub.plan}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("subscriptions.api_calls")}</span>
                    <span className="font-medium tabular-nums">
                      {sub.calls.toLocaleString()} / {sub.limit > 0 ? sub.limit.toLocaleString() : "∞"}
                    </span>
                  </div>
                  <div className="bg-muted overflow-hidden rounded-full">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${getUsageColor(percent)}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
