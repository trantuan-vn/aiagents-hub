"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { buildWebhookIntegrateExamples, type WebhookIntegrateLang } from "../../_lib/webhook-integrate-examples";
import type { WorkflowListWebhookAction } from "../../_lib/workflow-list-triggers";

const LANGS: {
  id: WebhookIntegrateLang;
  labelKey:
    | "webhook_integrate_lang_curl"
    | "webhook_integrate_lang_javascript"
    | "webhook_integrate_lang_python"
    | "webhook_integrate_lang_java";
}[] = [
  { id: "curl", labelKey: "webhook_integrate_lang_curl" },
  { id: "javascript", labelKey: "webhook_integrate_lang_javascript" },
  { id: "python", labelKey: "webhook_integrate_lang_python" },
  { id: "java", labelKey: "webhook_integrate_lang_java" },
];

function exampleForLang(examples: Record<WebhookIntegrateLang, string>, lang: WebhookIntegrateLang): string {
  switch (lang) {
    case "curl":
      return examples.curl;
    case "javascript":
      return examples.javascript;
    case "python":
      return examples.python;
    case "java":
      return examples.java;
  }
}

function isWebhookIntegrateLang(value: string): value is WebhookIntegrateLang {
  return value === "curl" || value === "javascript" || value === "python" || value === "java";
}

function CopyIconButton({
  value,
  label,
  copiedLabel,
  failedLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedLabel);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(failedLabel);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 rounded-none"
      onClick={() => void copy()}
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

interface WorkflowWebhookIntegrateDialogProps {
  webhook: WorkflowListWebhookAction | null;
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkflowWebhookIntegrateDialog({
  webhook,
  clientId,
  open,
  onOpenChange,
}: WorkflowWebhookIntegrateDialogProps) {
  const t = useTranslations("WorkflowsPage");
  const [tab, setTab] = useState<WebhookIntegrateLang>("curl");
  const [copiedCode, setCopiedCode] = useState(false);
  const trimmedClientId = clientId?.trim() ?? "";
  const resolvedClientId = trimmedClientId === "" ? "YOUR_CLIENT_ID" : trimmedClientId;

  const examples = useMemo(
    () =>
      webhook
        ? buildWebhookIntegrateExamples({
            url: webhook.url,
            clientId: resolvedClientId,
          })
        : null,
    [resolvedClientId, webhook],
  );

  useEffect(() => {
    setCopiedCode(false);
  }, [tab, webhook?.url]);

  const copyCode = async () => {
    if (!examples) return;
    try {
      await navigator.clipboard.writeText(exampleForLang(examples, tab));
      setCopiedCode(true);
      toast.success(t("webhook_integrate_copied"));
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error(t("webhook_integrate_copy_failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1.5 border-b px-6 py-5 pr-12 text-left">
          <DialogTitle>{t("webhook_integrate_title")}</DialogTitle>
          <DialogDescription>
            {t("webhook_integrate_desc")}{" "}
            <Link
              href="/dashboard/control/token"
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              {t("webhook_integrate_api_keys")}
            </Link>
          </DialogDescription>
        </DialogHeader>
        {webhook && examples ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t("webhook_integrate_url")}
              </p>
              <div className="flex items-stretch overflow-hidden rounded-md border">
                <span className="bg-muted text-muted-foreground flex items-center px-2.5 font-mono text-xs font-semibold">
                  POST
                </span>
                <Input
                  readOnly
                  value={webhook.url}
                  className="h-9 flex-1 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
                />
                <CopyIconButton
                  value={webhook.url}
                  label={t("webhook_integrate_copy")}
                  copiedLabel={t("webhook_integrate_copied")}
                  failedLabel={t("webhook_integrate_copy_failed")}
                />
              </div>
            </section>

            <section className="bg-muted/40 space-y-2 rounded-md border px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-medium">{t("webhook_integrate_headers")}</p>
              <p className="text-muted-foreground">{t("webhook_integrate_headers_desc")}</p>
              <div className="space-y-1 font-mono text-[11px]">
                <p>
                  <span className="text-muted-foreground">Authorization:</span> Bearer utk_YOUR_API_TOKEN
                </p>
                <p>
                  <span className="text-muted-foreground">X-Client-ID:</span> {resolvedClientId}
                </p>
                <p>
                  <span className="text-muted-foreground">Content-Type:</span> application/json
                </p>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t("webhook_integrate_examples")}
              </p>
              <div className="overflow-hidden rounded-lg border">
                <Tabs
                  value={tab}
                  onValueChange={(value) => {
                    if (isWebhookIntegrateLang(value)) setTab(value);
                  }}
                  className="gap-0"
                >
                  <div className="bg-muted/50 flex items-center justify-between gap-2 border-b px-2 py-1.5">
                    <TabsList className="h-8">
                      {LANGS.map((lang) => (
                        <TabsTrigger key={lang.id} value={lang.id} className="px-2.5 text-xs">
                          {t(lang.labelKey)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 text-xs"
                      onClick={() => void copyCode()}
                    >
                      {copiedCode ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedCode ? t("webhook_integrate_copied") : t("webhook_integrate_copy")}
                    </Button>
                  </div>
                  {LANGS.map((lang) => (
                    <TabsContent key={lang.id} value={lang.id} className="mt-0">
                      <pre className="max-h-72 overflow-auto bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed text-zinc-100 dark:bg-zinc-900">
                        <code>{exampleForLang(examples, lang.id)}</code>
                      </pre>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
