"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

import type { AgentWorkflow } from "../../_lib/api";

export function WorkflowCronBadge({
  cronExpr,
  cronCount,
  cronNextRunAt,
}: Pick<AgentWorkflow, "cronExpr" | "cronCount" | "cronNextRunAt">) {
  const t = useTranslations("WorkflowsPage");
  const extra = (cronCount ?? 1) > 1 ? ` ${t("cron_more", { count: (cronCount ?? 1) - 1 })}` : "";
  const nextLabel =
    cronNextRunAt != null
      ? t("cron_next_run", { time: new Date(cronNextRunAt).toLocaleString() })
      : t("cron_active");

  return (
    <Badge
      variant="outline"
      className="max-w-full gap-1 border-[#ff6f00]/35 bg-[#ff6f00]/10 font-normal text-[#c05621] dark:text-[#ffb074]"
      title={nextLabel}
      aria-label={`${t("cron_active")}${cronExpr ? `: ${cronExpr}` : ""}`}
    >
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff6f00] opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[#ff6f00]" />
      </span>
      <Clock className="size-3" aria-hidden />
      <span className="truncate font-mono text-[10px]">
        {cronExpr ?? t("cron_active")}
        {extra}
      </span>
    </Badge>
  );
}
