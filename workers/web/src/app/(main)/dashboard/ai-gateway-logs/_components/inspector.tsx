"use client";

import { useMemo, useState } from "react";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { filterJsonTree, formatCostUsd, hasLongNumberArray, presentJson, providerLabel } from "./format";

export type GatewayLogDetail = {
  id: string;
  provider: string;
  model: string;
  costUsd: number | null;
  durationMs: number;
  endpoint: string;
  requestType: string | null;
  userAgent: string | null;
  httpStatus: number | null;
  request: unknown;
  response: unknown;
  requestTruncated: boolean;
  responseTruncated: boolean;
};

function JsonPane({
  title,
  value,
  truncated,
}: {
  title: string;
  value: unknown;
  truncated: boolean;
}) {
  const t = useTranslations("AiGatewayLogsAdmin");
  const [query, setQuery] = useState("");
  const [showFull, setShowFull] = useState(false);
  const filtered = useMemo(() => filterJsonTree(value, query), [value, query]);
  const long = hasLongNumberArray(filtered);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("filter_json")}
          className="h-8 max-w-[220px] text-xs"
          aria-label={t("filter_json")}
        />
      </div>
      {truncated ? <p className="text-muted-foreground text-xs">{t("truncated_payload")}</p> : null}
      <pre className="bg-muted/40 max-h-[420px] overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
        {presentJson(filtered ?? null, showFull)}
      </pre>
      {long && !showFull ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setShowFull(true)}>
          {t("show_full_array")}
        </Button>
      ) : null}
    </div>
  );
}

export function LogInspector({
  detail,
  loading,
  error,
}: {
  detail: GatewayLogDetail | null;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations("AiGatewayLogsAdmin");
  const [copied, setCopied] = useState(false);

  if (loading && !detail) {
    return (
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="bg-muted h-40 animate-pulse rounded-md" />
        <div className="bg-muted h-40 animate-pulse rounded-md" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive p-3 text-sm">{error}</p>;
  }

  if (!detail) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(detail.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bg-card space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">
          {providerLabel(detail.provider)} / {detail.model}
        </h2>
        <span className="font-mono text-xs">{formatCostUsd(detail.costUsd)}</span>
        <span className="text-muted-foreground text-xs">{detail.durationMs} ms</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => void onCopy()}>
          <Copy className="size-3" />
          {copied ? t("copied") : t("copy_id")}
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <JsonPane title={t("request")} value={detail.request} truncated={detail.requestTruncated} />
        <JsonPane
          title={t("response_http", { status: detail.httpStatus ?? "—" })}
          value={detail.response}
          truncated={detail.responseTruncated}
        />
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground">{t("endpoint")}</div>
          <div className="font-mono break-all">{detail.endpoint || "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t("type")}</div>
          <div>{detail.requestType || "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t("col_user_agent")}</div>
          <div className="break-all">{detail.userAgent || "—"}</div>
        </div>
      </div>
    </div>
  );
}
