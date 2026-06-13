"use client";

import { Workflow } from "lucide-react";
import { useTranslations } from "next-intl";

import type { WebhookItemOutput } from "@aiagents-hub/workflow-nodes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { WebhookOutputPanel } from "./webhook-output-panel";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

type WebhookListeningPanelProps = {
  testUrl: string;
  onStop: () => void;
  receivedOutput?: WebhookItemOutput | null;
};

export function WebhookListeningPanel({ testUrl, onStop, receivedOutput }: WebhookListeningPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-muted/30 flex flex-col items-center gap-4 p-6 text-center">
        <Workflow className="size-10 text-[#eb5262]" strokeWidth={1.5} />
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("webhook_listening_title")}</p>
          <p className="text-muted-foreground text-sm">
            {t("webhook_listening_make_request", { method: "POST" })}
          </p>
        </div>
        <div className="bg-background w-full rounded-md border px-3 py-2.5 text-left font-mono text-xs leading-relaxed break-all">
          {testUrl}
        </div>
        <Button type="button" className={cn(ORANGE, "text-white")} onClick={onStop}>
          {t("webhook_stop_listening")}
        </Button>
      </div>
      {receivedOutput ? (
        <WebhookOutputPanel item={receivedOutput} compact className="border-t" />
      ) : null}
    </div>
  );
}
