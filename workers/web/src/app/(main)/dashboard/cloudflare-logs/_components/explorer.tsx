"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { API_BASE_URL, relativeTime, shortScript, type LogEventDto, type TimeRangeId } from "./types";

export function Explorer({
  range,
  includeWarn,
  onInvocation,
}: {
  range: TimeRangeId;
  includeWarn: boolean;
  onInvocation: (id: string) => void;
}) {
  const t = useTranslations("CloudflareLogsAdmin");
  const [events, setEvents] = useState<LogEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LogEventDto | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ range });
      if (includeWarn) qs.set("includeWarn", "1");
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/cloudflare-logs/events?${qs}`, {
        credentials: "include",
      });
      const body = (await res.json()) as { events?: LogEventDto[]; error?: string };
      if (!res.ok) throw new Error(body.error || t("load_error"));
      setEvents(body.events ?? []);
      if (body.error) setError(body.error);
    } catch (err) {
      setEvents([]);
      setError(err instanceof Error ? err.message : t("load_error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? t("loading") : t("load_live")}
        </Button>
        <p className="text-muted-foreground text-xs">{t("live_cf_raw")}</p>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_time")}</TableHead>
              <TableHead>{t("col_worker")}</TableHead>
              <TableHead>{t("col_error")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelected(e)}>
                <TableCell>{relativeTime(e.ts)}</TableCell>
                <TableCell>{shortScript(e.scriptName)}</TableCell>
                <TableCell>
                  <div>{e.event ?? e.message}</div>
                  <div className="text-muted-foreground text-xs">
                    {e.level} {e.httpStatus ?? ""} {e.outcome ?? ""}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {selected ? (
          <div className="space-y-2">
            {selected.invocationId ? (
              <Button size="sm" variant="secondary" onClick={() => onInvocation(selected.invocationId!)}>
                {t("view_live_invocation")}
              </Button>
            ) : null}
            <pre className="bg-muted max-h-[420px] overflow-auto rounded-md p-3 text-xs">
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
