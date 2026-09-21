"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { API_BASE_URL, type LogEventDto } from "./types";

export function InvocationPanel({ invocationId }: { invocationId: string | null }) {
  const t = useTranslations("CloudflareLogsAdmin");
  const [events, setEvents] = useState<LogEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invocationId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/dashboard/admin/cloudflare-logs/invocations/${encodeURIComponent(invocationId)}?range=7d`,
          { credentials: "include" },
        );
        const body = (await res.json()) as { events?: LogEventDto[]; error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error || t("load_error"));
        setEvents(body.events ?? []);
        setError(body.error ?? null);
      } catch (err) {
        if (!cancelled) {
          setEvents([]);
          setError(err instanceof Error ? err.message : t("load_error"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invocationId, t]);

  if (!invocationId) {
    return <p className="text-muted-foreground text-sm">{t("pick_invocation")}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-xs">{invocationId}</p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {events.map((e) => (
        <pre key={e.id} className="bg-muted overflow-auto rounded-md p-3 text-xs">
          {e.ts} {e.level} {e.event ?? e.message}
          {"\n"}
          {JSON.stringify(e.payload, null, 2)}
        </pre>
      ))}
    </div>
  );
}
