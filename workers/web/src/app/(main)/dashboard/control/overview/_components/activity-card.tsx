"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Activity {
  action: string;
  endpoint: string;
  status: "success" | "error" | "info";
  time: string;
}

interface ActivityCardProps {
  activities: Activity[];
  t: (key: string) => string;
}

export function ActivityCard({ activities, t }: ActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("activity.title")}</CardTitle>
        <CardDescription>{t("activity.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">{t("activity.no_activity")}</p>
          ) : (
            activities.map((activity) => (
              <div key={`${activity.action}-${activity.endpoint}-${activity.time}`} className="flex items-start gap-3">
                <div
                  className={`mt-2 h-2 w-2 rounded-full ${
                    activity.status === "success"
                      ? "bg-accent"
                      : activity.status === "error"
                        ? "bg-destructive"
                        : "bg-primary"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{activity.endpoint}</p>
                  <p className="text-muted-foreground text-xs">
                    {activity.action} • {activity.time}
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
