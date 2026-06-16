"use client";

import type { WebhookItemOutput } from "@aiagents-hub/workflow-nodes";
import { useTranslations } from "next-intl";

import { NodeOutputPanel } from "./node-output-panel";

type WebhookOutputPanelProps = {
  item: WebhookItemOutput;
  onEdit?: () => void;
  onUnpin?: () => void;
  compact?: boolean;
  className?: string;
};

export function WebhookOutputPanel({ item, onEdit, onUnpin, compact, className }: WebhookOutputPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");

  return (
    <NodeOutputPanel
      data={item as Record<string, unknown>}
      onEdit={onEdit}
      onUnpin={onUnpin}
      compact={compact}
      className={className}
      formatJson={(data) => JSON.stringify([data], null, 2)}
      showCopy
      headerExtra={
        <span className="text-muted-foreground text-[10px]">{t("webhook_output_item_count", { count: 1 })}</span>
      }
    />
  );
}
