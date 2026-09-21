"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { API_BASE_URL, relativeTime, shortScript, type ErrorGroup, type GroupNote, type GroupStatus } from "./types";

export function InboxTable({
  groups,
  obsErrorTotal,
  onOpenInvocation,
  onPatch,
}: {
  groups: ErrorGroup[];
  obsErrorTotal: number;
  onOpenInvocation: (fingerprint: string, excerpt: string | null) => void;
  onPatch: (fingerprint: string, body: { status?: GroupStatus; note?: string }) => Promise<void>;
}) {
  const t = useTranslations("CloudflareLogsAdmin");
  const [open, setOpen] = useState<ErrorGroup | null>(null);
  const [notes, setNotes] = useState<GroupNote[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const show = async (group: ErrorGroup) => {
    setOpen(group);
    setNote("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/dashboard/admin/cloudflare-logs/groups/${group.fingerprint}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const body = (await res.json()) as { group: ErrorGroup; notes: GroupNote[] };
        setOpen(body.group);
        setNotes(body.notes ?? []);
      }
    } catch {
      setNotes([]);
    }
  };

  const patch = async (status?: GroupStatus) => {
    if (!open) return;
    setBusy(true);
    try {
      await onPatch(open.fingerprint, { status, note: note.trim() || undefined });
      setNote("");
      await show(open);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col_severity")}</TableHead>
            <TableHead>{t("col_error")}</TableHead>
            <TableHead>{t("col_worker")}</TableHead>
            <TableHead>1h / 24h</TableHead>
            <TableHead>{t("col_last")}</TableHead>
            <TableHead>{t("col_status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                {obsErrorTotal > 0 ? t("inbox_behind_cf", { count: obsErrorTotal.toLocaleString() }) : t("no_events")}
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g) => (
              <TableRow key={g.fingerprint} className="cursor-pointer" onClick={() => void show(g)}>
                <TableCell>
                  <Badge variant={g.severity === "critical" || g.severity === "high" ? "destructive" : "secondary"}>
                    {g.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{g.title}</div>
                  <div className="text-muted-foreground font-mono text-xs">{g.fingerprint}</div>
                </TableCell>
                <TableCell>
                  {shortScript(g.scriptName)}
                  {g.component ? <div className="text-muted-foreground text-xs">{g.component}</div> : null}
                </TableCell>
                <TableCell>
                  {g.count1h} / {g.count24h}
                </TableCell>
                <TableCell>{relativeTime(g.lastSeen)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{g.status}</Badge>
                  {g.sampled ? <div className="text-xs text-amber-700 dark:text-amber-400">{t("sampled_warning")}</div> : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Sheet open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{open.title}</SheetTitle>
                <SheetDescription>
                  {open.scriptName} · {open.fingerprint}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <p>
                  {t("excerpt")}: {open.excerpt ?? "—"}
                </p>
                {open.runbookId ? (
                  <p>
                    {t("runbook")}: <span className="font-mono">{open.runbookId}</span>
                  </p>
                ) : null}
                <p className="text-muted-foreground">{t("live_cf_raw")}</p>
                <div className="flex flex-wrap gap-2">
                  {(["ack", "investigating", "resolved", "ignored"] as const).map((status) => (
                    <Button key={status} size="sm" variant="outline" disabled={busy} onClick={() => void patch(status)}>
                      {t(`status_${status}`)}
                    </Button>
                  ))}
                </div>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("note_placeholder")} />
                <Button size="sm" disabled={busy || !note.trim()} onClick={() => void patch()}>
                  {t("save_note")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onOpenInvocation(open.fingerprint, open.excerpt)}>
                  {t("view_live_invocation")}
                </Button>
                {notes.length ? (
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    {notes.map((n) => (
                      <li key={`${n.at}-${n.actor}`}>
                        {relativeTime(n.at)} {n.actor}: {n.status ?? ""} {n.note ?? ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
