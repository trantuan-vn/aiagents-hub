"use client";

import { useState } from "react";

import {
  BadgeCheck,
  ChevronDown,
  Download,
  ExternalLink,
  Info,
  ShieldCheck,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { SimpleIcon as BrandIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { IntegrationPreset } from "../_lib/api";
import {
  getActionAppDescription,
  getActionAppTitle,
  isCatalogActionApp,
  resolveActionAppDetail,
  type WorkflowActionAppCatalogItem,
  type WorkflowActionAppDetailMeta,
  type WorkflowActionAppRuntimeItem,
} from "./workflow-action-app-catalog";
import { ActionAppIcon } from "./workflow-action-app-icon";

type WorkflowActionAppDetailPanelProps = {
  item: WorkflowActionAppRuntimeItem;
  integration?: IntegrationPreset;
  onPickAction: (actionId: string, actionLabel: string) => void;
};

export function WorkflowActionAppDetailPanel({
  item,
  integration,
  onPickAction,
}: WorkflowActionAppDetailPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [installed, setInstalled] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(true);

  const title = getActionAppTitle(item, t);
  const description = getActionAppDescription(item, t);
  const detail = resolveActionAppDetail(item, integration);
  const verified = item.verified ?? Boolean(integration);
  const author = resolveAuthor(detail, item, title, t);
  const catalogItem = isCatalogActionApp(item) ? item : null;

  const handleInstall = () => {
    setInstalled(true);
  };

  return (
    <div className="p-3">
      <div className="flex gap-3">
        <DetailAppIcon
          catalogItem={catalogItem}
          detail={detail}
          className={detail.detailIconClassName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <h3 className="text-base font-semibold leading-tight">{title}</h3>
            {verified ? (
              <BadgeCheck
                className="mt-0.5 size-4 shrink-0 fill-foreground text-background"
                aria-label={t("action_app_verified")}
              />
            ) : null}
          </div>
          <Button
            type="button"
            className="mt-3 h-9 w-full bg-orange-500 font-semibold text-white hover:bg-orange-600"
            disabled={installed}
            onClick={handleInstall}
          >
            {installed ? t("action_app_installed") : t("action_app_install_node")}
          </Button>
        </div>
      </div>

      {description ? (
        <p className="text-muted-foreground mt-3 text-sm leading-snug">{description}</p>
      ) : null}

      <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs">
        {verified ? (
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("action_app_meta_verified")}
          </span>
        ) : null}
        {detail.usageCount != null ? (
          <span className="inline-flex items-center gap-1">
            <Download className="size-3.5" aria-hidden />
            {detail.usageCount}
          </span>
        ) : null}
        {author ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <User className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{author}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="flex w-full items-center justify-between py-1 text-left text-sm font-semibold"
          onClick={() => setActionsExpanded((v) => !v)}
          aria-expanded={actionsExpanded}
        >
          {t("action_app_actions_heading", { count: detail.actions.length })}
          <ChevronDown
            className={cn("text-muted-foreground size-4 transition-transform", actionsExpanded && "rotate-180")}
            aria-hidden
          />
        </button>

        {actionsExpanded ? (
          <div className="mt-2 space-y-2">
            {!installed ? (
              <div className="border-border bg-muted/40 flex gap-2 rounded-md border px-3 py-2.5 text-xs leading-snug">
                <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{t("action_app_install_to_use_actions")}</p>
              </div>
            ) : null}

            {detail.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={!installed}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                  installed
                    ? "hover:bg-muted focus-visible:bg-muted"
                    : "text-muted-foreground cursor-not-allowed opacity-70",
                )}
                onClick={() => onPickAction(action.id, t(action.nameKey))}
              >
                <DetailAppIcon
                  catalogItem={catalogItem}
                  detail={detail}
                  className={cn("size-6 rounded", detail.detailIconClassName)}
                  iconClassName="size-3.5"
                />
                <span>{t(action.nameKey)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowActionAppDetailHeader({
  docsUrl,
}: {
  docsUrl?: string;
}) {
  const t = useTranslations("WorkflowEditorPage");

  return docsUrl ? (
    <a
      href={docsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs font-medium"
    >
      {t("action_app_docs")}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  ) : (
    <span className="w-10" aria-hidden />
  );
}

function DetailAppIcon({
  catalogItem,
  detail,
  className,
  iconClassName,
}: {
  catalogItem: WorkflowActionAppCatalogItem | null;
  detail: WorkflowActionAppDetailMeta;
  className?: string;
  iconClassName?: string;
}) {
  const DetailLucide = detail.detailIcon;
  if (DetailLucide) {
    return (
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-lg",
          className ?? "bg-muted",
        )}
      >
        <DetailLucide className={cn("size-6", iconClassName)} aria-hidden />
      </span>
    );
  }

  return (
    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted", className)}>
      <ActionAppIcon item={catalogItem} className={iconClassName ?? "size-6"} />
    </span>
  );
}

function resolveAuthor(
  detail: WorkflowActionAppDetailMeta,
  item: WorkflowActionAppRuntimeItem,
  title: string,
  t: (key: string) => string,
): string | undefined {
  if (detail.author) return detail.author;
  if (detail.authorKey) return t(detail.authorKey);
  return title;
}
