"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { EnterpriseStatus } from "@/lib/enterprise-api";

export function EnterpriseStatusBadge({ status, adminHold }: { status: EnterpriseStatus; adminHold?: boolean }) {
  const t = useTranslations("Enterprise.status");
  const variant = status === "active" ? "default" : status === "suspended" ? "destructive" : "secondary";
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant}>{t(status)}</Badge>
      {adminHold ? <Badge variant="outline">{t("hold")}</Badge> : null}
    </span>
  );
}
