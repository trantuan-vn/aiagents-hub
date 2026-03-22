"use client";

import { Activity, CheckCircle2, AlertCircle, Info } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ActivityItem {
  action: string;
  endpoint: string;
  status: "success" | "error" | "info";
  time: string;
}

interface ActivityCardProps {
  activities: ActivityItem[];
  t: (key: string) => string;
}

function StatusIcon({ status }: { status: ActivityItem["status"] }) {
  const entries: Record<ActivityItem["status"], { Icon: typeof CheckCircle2; className: string; bg: string }> = {
    success: { Icon: CheckCircle2, className: "text-emerald-500", bg: "bg-emerald-500/10" },
    error: { Icon: AlertCircle, className: "text-destructive", bg: "bg-destructive/10" },
    info: { Icon: Info, className: "text-primary", bg: "bg-primary/10" },
  };
  const entry = status === "success" ? entries.success : status === "error" ? entries.error : entries.info;
  const { Icon, className, bg } = entry;
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
      <Icon className={`h-4 w-4 ${className}`} />
    </div>
  );
}

export function ActivityCard({ activities, t }: ActivityCardProps) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="text-primary h-5 w-5" />
          {t("activity.title")}
        </CardTitle>
        <CardDescription>{t("activity.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
              <Activity className="text-muted-foreground mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">{t("activity.no_activity")}</p>
            </div>
          ) : (
            activities.map((activity) => (
              <div
                key={`${activity.action}-${activity.endpoint}-${activity.time}`}
                className="hover:bg-muted/50 flex items-start gap-3 rounded-lg p-3 transition-colors"
              >
                <StatusIcon status={activity.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{activity.endpoint}</p>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    <span>{activity.action}</span>
                    <span>•</span>
                    <span>{activity.time}</span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
