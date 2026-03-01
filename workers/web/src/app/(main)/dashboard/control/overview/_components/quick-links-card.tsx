"use client";

import { ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickLinksCardProps {
  t: (key: string) => string;
}

const LINKS = [
  { nameKey: "quick_links.api_documentation", path: "/docs" },
  { nameKey: "quick_links.support_center", path: "/support" },
  { nameKey: "quick_links.status_page", path: "/status" },
  { nameKey: "quick_links.billing_history", path: "/dashboard/control/billing" },
] as const;

export function QuickLinksCard({ t }: QuickLinksCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("quick_links.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {LINKS.map(({ nameKey, path }) => (
          <button
            key={nameKey}
            type="button"
            onClick={() => {
              window.location.href = path;
            }}
            className="hover:bg-muted flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors"
          >
            <span className="text-sm">{t(nameKey)}</span>
            <ExternalLink className="text-muted-foreground h-4 w-4" />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
