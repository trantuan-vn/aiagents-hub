"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { API_BASE_URL } from "./types";

const ARCHIVE_TABLES = [
  "service_usages",
  "orders",
  "payments",
  "refunds",
] as const;

export function ActionsPanel({
  defaultUserId,
  onDone,
}: {
  defaultUserId?: string;
  onDone?: () => void;
}) {
  const t = useTranslations("PipelineHealthAdmin");
  const [flushUserId, setFlushUserId] = useState(defaultUserId ?? "");
  const [flushTable, setFlushTable] = useState("");
  const [rerunTable, setRerunTable] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const postAction = async (path: string, body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await parseDashboardApiError(res);
        if (isStepUpRequired(errBody)) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("action_error")));
      }
      const json = await res.json();
      setMessage(JSON.stringify(json, null, 2));
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("action_error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("action_force_flush")}</CardTitle>
          <CardDescription>{t("action_force_flush_help")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <input
            className="border-input bg-background w-full rounded-md border px-2 py-1 font-mono text-sm"
            placeholder="64-char DO userId"
            value={flushUserId}
            onChange={(e) => setFlushUserId(e.target.value.trim())}
          />
          <input
            className="border-input bg-background w-full rounded-md border px-2 py-1 font-mono text-sm"
            placeholder={t("action_table_optional")}
            value={flushTable}
            onChange={(e) => setFlushTable(e.target.value.trim())}
          />
          <Button
            disabled={busy != null || flushUserId.length !== 64}
            onClick={() => {
              if (!window.confirm(t("action_force_flush_confirm"))) return;
              void postAction(
                "/actions/force-flush",
                { userId: flushUserId, table: flushTable || undefined, confirm: true, force: true },
                "flush",
              );
            }}
          >
            {busy === "flush" ? t("action_running") : t("action_force_flush")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("action_rerun")}</CardTitle>
          <CardDescription>{t("action_rerun_help")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <select
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
            value={rerunTable}
            onChange={(e) => setRerunTable(e.target.value)}
          >
            <option value="">{t("action_rerun_all")}</option>
            {ARCHIVE_TABLES.map((table) => (
              <option key={table} value={table}>
                {table}
              </option>
            ))}
          </select>
          <Button
            disabled={busy != null}
            onClick={() => {
              const all = !rerunTable;
              if (!window.confirm(all ? t("action_rerun_all_confirm") : t("action_rerun_table_confirm"))) return;
              void postAction(
                "/actions/rerun-pipeline",
                all ? { all: true, confirm: true } : { table: rerunTable, confirm: true },
                "rerun",
              );
            }}
          >
            {busy === "rerun" ? t("action_running") : t("action_rerun")}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-destructive text-sm md:col-span-2">{error}</p> : null}
      {message ? (
        <pre className="bg-muted/40 max-h-64 overflow-auto rounded-lg border p-3 text-xs md:col-span-2">{message}</pre>
      ) : null}
    </div>
  );
}
