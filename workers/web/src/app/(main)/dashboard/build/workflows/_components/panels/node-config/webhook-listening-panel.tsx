"use client";

import { useEffect, useRef, useState } from "react";

import { Check, Copy, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { WebhookItemOutput } from "@aiagents-hub/workflow-nodes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WebhookOutputPanel } from "./webhook-output-panel";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

type WebhookListeningPanelProps = {
  testUrl: string;
  onStop: () => void;
  receivedOutput?: WebhookItemOutput | null;
  compact?: boolean;
};

export function WebhookListeningPanel({
  testUrl,
  onStop,
  receivedOutput,
  compact = false,
}: WebhookListeningPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [copied, setCopied] = useState(false);
  const copiedResetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedResetRef.current != null) window.clearTimeout(copiedResetRef.current);
    },
    [],
  );

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(testUrl);
      setCopied(true);
      toast.success(t("webhook_copied"));
      if (copiedResetRef.current != null) window.clearTimeout(copiedResetRef.current);
      copiedResetRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("webhook_copy_failed"));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "bg-muted/30 flex flex-col items-center text-center",
          compact ? "gap-2 p-3" : "gap-4 p-6",
        )}
      >
        <Workflow className={cn("text-[#eb5262]", compact ? "size-6" : "size-10")} strokeWidth={1.5} />
        <div className={compact ? "space-y-0.5" : "space-y-1"}>
          <p className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>{t("webhook_listening_title")}</p>
          <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-sm")}>
            {t("webhook_listening_make_request", { method: "POST" })}
          </p>
        </div>
        <div className="flex w-full items-stretch overflow-hidden rounded-md border">
          <div
            title={testUrl}
            className={cn(
              "bg-background min-w-0 flex-1 text-left font-mono text-xs",
              compact ? "truncate px-2.5 py-1.5" : "px-3 py-2.5 leading-relaxed break-all",
            )}
          >
            {testUrl}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("shrink-0 rounded-none", compact ? "size-8" : "size-9")}
            onClick={() => void copyUrl()}
            aria-label={t("webhook_copy_url")}
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          className={cn(ORANGE, "text-white", compact && "h-8")}
          onClick={onStop}
        >
          {t("webhook_stop_listening")}
        </Button>
      </div>
      {receivedOutput ? (
        <WebhookOutputPanel
          item={receivedOutput}
          compact
          className={cn("border-t", compact && "max-h-40 overflow-auto")}
        />
      ) : null}
    </div>
  );
}
