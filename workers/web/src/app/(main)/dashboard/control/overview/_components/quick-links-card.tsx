"use client";

import Link from "next/link";

import { CreditCard, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuickLinksCardProps {
  t: (key: string) => string;
}

const LINKS = [
  { nameKey: "quick_links.billing_history", path: "/dashboard/control/billing", icon: CreditCard },
] as const;

export function QuickLinksCard({ t }: QuickLinksCardProps) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>{t("quick_links.title")}</CardTitle>
        <p className="text-muted-foreground text-sm">{t("quick_links.description")}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {LINKS.map(({ nameKey, path, icon: Icon }) => (
          <Link
            key={nameKey}
            href={path}
            className="hover:bg-muted/80 flex w-full items-center justify-between gap-3 rounded-lg p-3 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
                <Icon className="text-muted-foreground h-4 w-4" />
              </div>
              <span className="text-sm font-medium">{t(nameKey)}</span>
            </div>
            <ExternalLink className="text-muted-foreground h-4 w-4 shrink-0" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
