"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { dashboardApiErrorMessage, isStepUpRequired, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { API_BASE_URL, relativeTime, type AuxBucketHealth, type DlqEntryDto } from "./types";

export function DlqPanel({
  entries,
  onReplayDone,
}: {
  entries: DlqEntryDto[];
  onReplayDone?: () => void;
}) {
  const t = useTranslations("PipelineHealthAdmin");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const replay = async (id: number) => {
    if (!window.confirm(t("dlq_replay_confirm"))) return;
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/pipeline-health/actions/replay-dlq`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, confirm: true }),
      });
      if (!res.ok) {
        const errBody = await parseDashboardApiError(res);
        if (isStepUpRequired(errBody)) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("action_error")));
      }
      setMessage(t("dlq_replay_ok"));
      onReplayDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("action_error"));
    } finally {
      setBusyId(null);
    }
  };

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("no_dlq")}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{t("dlq_help")}</p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p> : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-2 py-1.5">ID</th>
              <th className="px-2 py-1.5">{t("col_table")}</th>
              <th className="px-2 py-1.5">userId</th>
              <th className="px-2 py-1.5">queueId</th>
              <th className="px-2 py-1.5">{t("col_status")}</th>
              <th className="px-2 py-1.5">{t("col_last")}</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-2 py-1.5 font-mono text-xs">{e.id}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{e.tableName ?? "—"}</td>
                <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-xs" title={e.userId ?? undefined}>
                  {e.userId ? `${e.userId.slice(0, 8)}…` : "—"}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs">{e.queueId ?? "—"}</td>
                <td className="px-2 py-1.5 text-xs">{e.status}</td>
                <td className="px-2 py-1.5 text-xs">{relativeTime(e.receivedAt)}</td>
                <td className="px-2 py-1.5">
                  {e.canReplay ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === e.id}
                      onClick={() => void replay(e.id)}
                    >
                      {busyId === e.id ? t("action_running") : t("dlq_replay")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AuxBucketsPanel({ buckets }: { buckets: AuxBucketHealth[] }) {
  const t = useTranslations("PipelineHealthAdmin");
  if (buckets.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("no_aux_buckets")}</p>;
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {buckets.map((b) => (
        <div key={b.id} className="rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {b.id === "ekyc" ? t("aux_ekyc") : t("aux_version")} · {b.status}
          </p>
          <p className="text-muted-foreground text-xs">{b.binding}</p>
          <p className="text-muted-foreground mt-1 text-xs">{b.summary}</p>
        </div>
      ))}
    </div>
  );
}
