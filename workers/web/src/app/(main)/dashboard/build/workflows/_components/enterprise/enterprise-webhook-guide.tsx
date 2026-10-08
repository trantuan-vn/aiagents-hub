"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildEnterpriseHookExamples, type EnterpriseHookLang } from "@/lib/enterprise-hook-examples";
import { buildWebhookPublicUrl } from "../panels/node-config/webhook-url";

const LANGS: { id: EnterpriseHookLang; labelKey: LangKey }[] = [
  { id: "curl", labelKey: "webhook_integrate_lang_curl" },
  { id: "javascript", labelKey: "webhook_integrate_lang_javascript" },
  { id: "python", labelKey: "webhook_integrate_lang_python" },
  { id: "java", labelKey: "webhook_integrate_lang_java" },
  { id: "go", labelKey: "webhook_integrate_lang_go" },
  { id: "rust", labelKey: "webhook_integrate_lang_rust" },
];

type LangKey =
  | "webhook_integrate_lang_curl"
  | "webhook_integrate_lang_javascript"
  | "webhook_integrate_lang_python"
  | "webhook_integrate_lang_java"
  | "webhook_integrate_lang_go"
  | "webhook_integrate_lang_rust";

function bodyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => bodyPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" ? bodyPaths(child, next) : [next];
    });
  }
  return prefix ? [prefix] : [];
}

/** Language samples for a webhook. The URL has no secret; the API token is a header. */
export function EnterpriseWebhookGuide({
  body,
  bodyExample,
  workflowId,
  ownerId,
  webhookPath,
}: {
  body: string;
  bodyExample?: Record<string, unknown>;
  workflowId: number;
  ownerId: string;
  webhookPath?: string;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const user = useDashboardUser();
  const [lang, setLang] = useState<EnterpriseHookLang>("curl");
  const [copied, setCopied] = useState(false);
  const clientId = user?.clientId?.trim() || user?.id?.trim() || "YOUR_CLIENT_ID";
  const url = webhookPath ? buildWebhookPublicUrl({ workflowId, webhookPath, ownerId }) : "";
  const examples = useMemo(
    () => (url ? buildEnterpriseHookExamples({ url, clientId, body }) : null),
    [url, clientId, body],
  );
  const code = examples?.[lang] ?? "";
  const paths = bodyPaths(bodyExample ?? {});

  const copy = async (value: string, markCode = false) => {
    try {
      await navigator.clipboard.writeText(value);
      if (markCode) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
      toast.success(t("webhook_integrate_copied"));
    } catch {
      toast.error(t("webhook_integrate_copy_failed"));
    }
  };

  return (
    <section className="min-w-0 space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("webhook_integrate_title")}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {paths.length ? t("webhook_integrate_hint") : t("webhook_integrate_no_fields")}{" "}
          <Link
            href="/dashboard/control/token"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {t("webhook_integrate_api_keys")}
          </Link>
        </p>
        {paths.length ? (
          <p className="text-muted-foreground font-mono text-[11px] leading-relaxed break-all">
            {paths.map((path) => `$json.body.${path}`).join("  ·  ")}
          </p>
        ) : null}
      </div>

      {url ? (
        <>
          <div className="flex items-stretch overflow-hidden rounded-md border">
            <span className="bg-muted text-muted-foreground flex items-center px-2.5 font-mono text-xs font-semibold">
              POST
            </span>
            <Input
              readOnly
              value={url}
              className="h-9 min-w-0 flex-1 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-none"
              aria-label={t("webhook_integrate_copy")}
              onClick={() => void copy(url)}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <div className="bg-muted/40 space-y-1 rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed">
            <p>
              <span className="text-muted-foreground">Authorization:</span> Bearer utk_YOUR_API_TOKEN
            </p>
            <p>
              <span className="text-muted-foreground">X-Client-ID:</span> {clientId}
            </p>
            <p>
              <span className="text-muted-foreground">Content-Type:</span> application/json
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5">
              <div className="flex flex-wrap gap-1">
                {LANGS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={lang === item.id ? "secondary" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      setLang(item.id);
                      setCopied(false);
                    }}
                  >
                    {t(item.labelKey)}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1.5 text-xs"
                onClick={() => void copy(code, true)}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t("webhook_integrate_copied") : t("webhook_integrate_copy")}
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto bg-zinc-950 p-3 font-mono text-[12px] leading-relaxed text-zinc-100 dark:bg-zinc-900">
              <code>{code}</code>
            </pre>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">{t("webhook_integrate_no_url")}</p>
      )}
    </section>
  );
}
