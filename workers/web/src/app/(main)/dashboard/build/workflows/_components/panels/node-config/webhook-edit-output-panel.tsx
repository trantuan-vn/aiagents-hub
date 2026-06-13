"use client";

import { useState } from "react";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  buildWebhookItemOutput,
  normalizeWebhookItemOutput,
} from "@aiagents-hub/workflow-nodes";

import { JsonCodeEditor } from "./json-code-editor";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

export const DEFAULT_MOCK_OUTPUT_JSON = JSON.stringify(
  [
    buildWebhookItemOutput({
      webhookUrl: "https://api.example.com/hooks/workflows/1/my-webhook",
      headers: {
        host: "api.example.com",
        "user-agent": "curl/8.7.1",
        accept: "*/*",
      },
      params: {},
      query: {},
      body: { message: "Hello" },
      executionMode: "test",
    }),
  ],
  null,
  2,
);

export function outputToEditorText(output: unknown, webhookUrl?: string): string {
  const item = normalizeWebhookItemOutput(output, webhookUrl);
  if (item) return JSON.stringify([item], null, 2);
  if (output == null) {
    if (webhookUrl) {
      return JSON.stringify(
        [buildWebhookItemOutput({ webhookUrl, body: { message: "Hello" }, executionMode: "test" })],
        null,
        2,
      );
    }
    return DEFAULT_MOCK_OUTPUT_JSON;
  }
  if (typeof output === "object" && Object.keys(output as object).length === 0) {
    return DEFAULT_MOCK_OUTPUT_JSON;
  }
  return JSON.stringify(output, null, 2);
}

type WebhookEditOutputPanelProps = {
  initialOutput: unknown;
  webhookUrl?: string;
  onSave: (output: unknown) => void;
  onCancel: () => void;
};

export function WebhookEditOutputPanel({
  initialOutput,
  webhookUrl,
  onSave,
  onCancel,
}: WebhookEditOutputPanelProps) {
  const t = useTranslations("WorkflowNodeRegistry");
  const [text, setText] = useState(() => outputToEditorText(initialOutput, webhookUrl));

  const handleSave = () => {
    try {
      const parsed: unknown = JSON.parse(text);
      onSave(parsed);
    } catch {
      toast.error(t("webhook_edit_output_invalid_json"));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase">{t("webhook_edit_output_title")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
            {t("webhook_edit_output_cancel")}
          </Button>
          <Button type="button" size="sm" className={cn(ORANGE, "h-7 text-xs text-white")} onClick={handleSave}>
            {t("webhook_edit_output_save")}
          </Button>
        </div>
      </div>

      <JsonCodeEditor value={text} onChange={setText} />

      <div className="text-muted-foreground flex items-start gap-1.5 border-t px-3 py-2.5 text-[11px] leading-relaxed">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          {t("webhook_edit_output_hint")}{" "}
          <a
            href="https://docs.n8n.io/data/data-editing/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline-offset-2 hover:underline"
          >
            {t("webhook_edit_output_learn_more")}
          </a>
        </p>
      </div>
    </div>
  );
}
