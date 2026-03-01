"use client";

import { ChevronRight, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

export function SubscriptionsCard({ subscriptions, t }: SubscriptionsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("subscriptions.title")}</CardTitle>
            <CardDescription>{t("subscriptions.description")}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = "/packages";
            }}
          >
            {t("subscriptions.view_all")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Package className="text-muted-foreground mb-3 h-10 w-10" />
            <p className="text-muted-foreground text-sm">{t("no_subscriptions")}</p>
          </div>
        ) : (
          subscriptions.map((sub) => (
            <div key={sub.id} className="bg-muted/50 rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{sub.name}</h4>
                  <p className="text-muted-foreground text-sm">
                    {sub.plan && `${sub.plan} ${t("subscriptions.plan")}`}
                    {sub.nextBilling && ` • ${t("subscriptions.renews")} ${sub.nextBilling}`}
                  </p>
                </div>
                {sub.plan && <Badge variant="outline">{sub.plan}</Badge>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("subscriptions.api_calls")}</span>
                  <span>
                    {sub.calls.toLocaleString()} / {sub.limit > 0 ? sub.limit.toLocaleString() : "∞"}
                  </span>
                </div>
                <Progress value={sub.limit > 0 ? (sub.calls / sub.limit) * 100 : 0} className="h-2" />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
