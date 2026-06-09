"use client";

import { Workflow } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

type WebhookListeningPanelProps = {
  httpMethod: string;
  testUrl: string;
  onStop: () => void;
};

export function WebhookListeningPanel({ httpMethod, testUrl, onStop }: WebhookListeningPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");

  return (
    <div className="bg-muted/30 flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Workflow className="size-10 text-[#eb5262]" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{t("webhook_listening_title")}</p>
        <p className="text-muted-foreground text-sm">
          {t("webhook_listening_make_request", { method: httpMethod })}
        </p>
      </div>
      <div className="bg-background w-full rounded-md border px-3 py-2.5 text-left font-mono text-xs leading-relaxed break-all">
        {testUrl}
      </div>
      <Button type="button" className={cn(ORANGE, "mt-2 text-white")} onClick={onStop}>
        {t("webhook_stop_listening")}
      </Button>
    </div>
  );
}
