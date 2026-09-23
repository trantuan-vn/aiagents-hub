"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { relativeTime, type IncidentStatus, type PipelineIncident } from "./types";

export function IncidentsTable({
  incidents,
  onPatch,
}: {
  incidents: PipelineIncident[];
  onPatch: (fingerprint: string, body: { status?: IncidentStatus; note?: string }) => Promise<void>;
}) {
  const t = useTranslations("PipelineHealthAdmin");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!incidents.length) {
    return <p className="text-muted-foreground text-sm">{t("no_incidents")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-2">{t("col_severity")}</th>
            <th className="p-2">{t("col_code")}</th>
            <th className="p-2">{t("col_stage")}</th>
            <th className="p-2">{t("col_table")}</th>
            <th className="p-2">1h / 24h</th>
            <th className="p-2">{t("col_last")}</th>
            <th className="p-2">{t("col_status")}</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((g) => (
            <Fragment key={g.fingerprint}>
              <tr
                className="hover:bg-muted/30 cursor-pointer border-t"
                onClick={() => setOpen(open === g.fingerprint ? null : g.fingerprint)}
              >
                <td className="p-2">
                  <Badge variant={g.severity === "critical" ? "destructive" : "secondary"}>{g.severity}</Badge>
                </td>
                <td className="p-2 font-mono text-xs">{g.code}</td>
                <td className="p-2">{g.stage}</td>
                <td className="p-2">{g.tableName ?? "—"}</td>
                <td className="p-2">
                  {g.count1h} / {g.count24h}
                </td>
                <td className="p-2">{relativeTime(g.lastSeen)}</td>
                <td className="p-2">{g.status}</td>
              </tr>
              {open === g.fingerprint ? (
                <tr className="bg-muted/20 border-t">
                  <td colSpan={7} className="space-y-2 p-3">
                    <p className="font-medium">{g.title}</p>
                    {g.excerpt ? <p className="text-muted-foreground text-xs break-all">{g.excerpt}</p> : null}
                    {g.runbookId ? (
                      <p className="text-xs">
                        {t("runbook")}: {g.runbookId}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {(["ack", "investigating", "resolved", "ignored"] as const).map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onPatch(g.fingerprint, { status: st });
                          }}
                        >
                          {t(`status_${st}`)}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="border-input bg-background flex-1 rounded-md border px-2 py-1 text-sm"
                        placeholder={t("note_placeholder")}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onPatch(g.fingerprint, { note: note || undefined });
                          setNote("");
                        }}
                      >
                        {t("save_note")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
