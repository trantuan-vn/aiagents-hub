"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { listComments, listSharedWorkflows, postComment, setWorkflowStar, type AgentWorkflow } from "../_lib/api";

import { StarDisplay } from "./star-display";
import { WorkflowExecuteDialog } from "./workflow-execute-dialog";

function workflowKey(wf: AgentWorkflow): string {
  return `${wf.user_id}:${wf.id}`;
}

export function SharedWorkflowsTab() {
  const t = useTranslations("WorkflowsPage");
  const [items, setItems] = useState<AgentWorkflow[]>([]);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [executeTarget, setExecuteTarget] = useState<{ id: number; ownerId: string } | null>(null);
  const [commentDraft, setCommentDraft] = useState<Map<string, string>>(() => new Map());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comments, setComments] = useState<Map<string, Record<string, unknown>[]>>(() => new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { workflows } = await listSharedWorkflows({
        search: search || undefined,
        starCount: starFilter,
      });
      setItems(workflows);
    } catch {
      toast.error(t("load_error"));
    } finally {
      setLoading(false);
    }
  }, [search, starFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCommentsFor = async (wf: AgentWorkflow) => {
    if (!wf.user_id || !wf.id) return;
    const k = workflowKey(wf);
    setExpanded(k);
    const { comments: rows } = await listComments(wf.user_id, wf.id);
    setComments((prev) => new Map(prev).set(k, rows));
  };

  const submitComment = async (wf: AgentWorkflow) => {
    if (!wf.user_id || !wf.id) return;
    const k = workflowKey(wf);
    const content = (commentDraft.get(k) ?? "").trim();
    if (!content) return;
    await postComment(wf.user_id, wf.id, { content });
    setCommentDraft((prev) => {
      const next = new Map(prev);
      next.set(k, "");
      return next;
    });
    await loadCommentsFor(wf);
    toast.success(t("add_comment"));
  };

  return (
    <div className="space-y-4">
      <WorkflowExecuteDialog
        workflowId={executeTarget?.id ?? 0}
        ownerId={executeTarget?.ownerId}
        open={executeTarget != null}
        onOpenChange={(open) => !open && setExecuteTarget(null)}
      />
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          value={starFilter ?? ""}
          onChange={(e) => setStarFilter(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">{t("filter_stars")}</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} {t("stars")}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          {t("search")}
        </Button>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">...</p>
      ) : !items.length ? (
        <p className="text-muted-foreground text-sm">{t("no_shared")}</p>
      ) : (
        <div className="grid gap-4">
          {items.map((wf) => {
            const k = workflowKey(wf);
            const draft = commentDraft.get(k) ?? "";
            const thread = comments.get(k) ?? [];
            return (
              <Card key={k}>
                <CardHeader>
                  <CardTitle className="text-base">{wf.name}</CardTitle>
                  <CardDescription>{wf.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                    <StarDisplay count={wf.starCount} />
                    {wf.starLabel ? <Badge variant="secondary">{wf.starLabel}</Badge> : null}
                    <span>
                      {t("usage_count")}: {wf.usageCount ?? 0}
                    </span>
                    <span>
                      {t("earnings")}: {(wf.totalEarningsVnd ?? 0).toLocaleString()} VND
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" asChild>
                      <Link
                        href={`/dashboard/build/workflows/${wf.id}/chat?owner=${encodeURIComponent(wf.user_id ?? "")}`}
                      >
                        {t("open_chat")}
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => wf.id && wf.user_id && setExecuteTarget({ id: wf.id, ownerId: wf.user_id })}
                    >
                      {t("execute")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void loadCommentsFor(wf)}>
                      {t("comments")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        wf.user_id &&
                        wf.id &&
                        setWorkflowStar(wf.user_id, wf.id, { starCount: 5 }).then(() => toast.success(t("stars")))
                      }
                    >
                      ★ {t("stars")}
                    </Button>
                  </div>
                  {expanded === k && (
                    <div className="space-y-2 border-t pt-3">
                      {thread.map((c) => (
                        <div
                          key={String(c.id ?? c.globalId ?? c.created_at)}
                          className="bg-muted/50 rounded-md p-2 text-sm"
                        >
                          <p>{String(c.content ?? "")}</p>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          value={draft}
                          onChange={(e) => setCommentDraft((prev) => new Map(prev).set(k, e.target.value))}
                          placeholder={t("add_comment")}
                        />
                        <Button size="sm" onClick={() => void submitComment(wf)}>
                          {t("add_comment")}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
