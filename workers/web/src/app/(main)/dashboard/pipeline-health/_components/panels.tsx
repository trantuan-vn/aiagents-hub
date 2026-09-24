"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

import { relativeTime, type CronRunSummary, type HotUserRow, type TableHealthRow } from "./types";

export function TablesPanel({ tables }: { tables: TableHealthRow[] }) {
  const t = useTranslations("PipelineHealthAdmin");
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-2">{t("col_table")}</th>
            <th className="p-2">Sync</th>
            <th className="p-2">Archive</th>
            <th className="p-2">Incidents</th>
            <th className="p-2">Last cron</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((row) => (
            <tr key={row.table} className="border-t">
              <td className="p-2 font-mono text-xs">{row.table}</td>
              <td className="p-2">{row.sync ? "✓" : "—"}</td>
              <td className="p-2">{row.archive ? "✓" : "—"}</td>
              <td className="p-2">{row.incidentCount}</td>
              <td className="p-2">
                {row.lastCronSuccess == null ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Badge variant={row.lastCronSuccess ? "secondary" : "destructive"}>
                      {row.lastCronSuccess ? "OK" : "FAIL"}
                    </Badge>
                    {row.lastCronAt ? relativeTime(row.lastCronAt) : null}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CronRunsPanel({ runs }: { runs: CronRunSummary[] }) {
  const t = useTranslations("PipelineHealthAdmin");
  if (!runs.length) return <p className="text-muted-foreground text-sm">{t("no_cron_runs")}</p>;
  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <div key={run.id} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={run.success ? "secondary" : "destructive"}>{run.success ? "OK" : "FAIL"}</Badge>
            <span>
              {run.successful}/{run.totalPipelines} · {relativeTime(run.finishedAt)}
            </span>
            <span className="text-muted-foreground text-xs">{run.finishedAt}</span>
          </div>
          {run.results?.length ? (
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
              {run.results.map((r) => (
                <li key={`${run.id}-${r.tableName}`}>
                  {r.tableName}: {r.success ? "ok" : r.error ?? "fail"} ({r.recordsProcessed})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function HotUsersPanel({
  users,
  onProbe,
}: {
  users: HotUserRow[];
  onProbe: (userId: string) => void;
}) {
  const t = useTranslations("PipelineHealthAdmin");
  if (!users.length) return <p className="text-muted-foreground text-sm">{t("no_hot_users")}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-2">userId</th>
            <th className="p-2">reason</th>
            <th className="p-2">{t("col_table")}</th>
            <th className="p-2">{t("col_last")}</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.userId} className="border-t">
              <td className="p-2 font-mono text-xs">{u.userId.slice(0, 12)}…</td>
              <td className="p-2">{u.reason}</td>
              <td className="p-2">{u.lastTable ?? "—"}</td>
              <td className="p-2">{relativeTime(u.lastSignalAt)}</td>
              <td className="p-2">
                <button type="button" className="text-primary text-xs underline" onClick={() => onProbe(u.userId)}>
                  {t("do_probe")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phase B: read-only view of sync.pause_tables / sync.pause_user */
export function SyncPauseStatusPanel({
  pauseTables,
  pauseUsers,
}: {
  pauseTables: string[];
  pauseUsers: Array<{ userId: string; reason?: string; by?: string; at?: number }>;
}) {
  const idle = !pauseTables.length && !pauseUsers.length;
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="mb-2 font-medium">Sync pause (kill-switch)</div>
      {idle ? (
        <p className="text-muted-foreground text-sm">No tables or users paused.</p>
      ) : (
        <div className="space-y-2">
          {pauseTables.length ? (
            <div>
              <div className="text-muted-foreground mb-1 text-xs">Paused tables</div>
              <div className="flex flex-wrap gap-1">
                {pauseTables.map((name) => (
                  <Badge key={name} variant="destructive">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {pauseUsers.length ? (
            <div>
              <div className="text-muted-foreground mb-1 text-xs">Paused users</div>
              <ul className="space-y-1 font-mono text-xs">
                {pauseUsers.map((u) => (
                  <li key={u.userId}>
                    {u.userId.slice(0, 16)}…{u.reason ? ` · ${u.reason}` : ""}
                    {u.by ? ` · by ${u.by}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <p className="text-muted-foreground mt-2 text-xs">
        Force flush still works with force=true. API:{" "}
        <code className="text-[10px]">/pipeline-health/actions/pause-*</code>
      </p>
    </div>
  );
}
