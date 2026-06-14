"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  getWorkflowStar,
  listComments,
  listSharedWorkflows,
  postComment,
  setWorkflowStar,
  type AgentWorkflow,
} from "../../_lib/api";
import { workflowKey } from "../../_lib/shared-workflow-utils";

import { SharedWorkflowCard } from "./shared-workflow-card";
import { WorkflowExecuteDialog } from "../panels/workflow-panels/workflow-execute-dialog";

async function fetchMyStarsForWorkflows(workflows: AgentWorkflow[]): Promise<Map<string, number>> {
  const entries = await Promise.all(
    workflows
      .filter((wf) => wf.user_id && wf.id)
      .map(async (wf) => {
        try {
          const { star } = await getWorkflowStar(wf.user_id!, wf.id!);
          return [workflowKey(wf), star?.starCount ?? 0] as const;
        } catch {
          return [workflowKey(wf), 0] as const;
        }
      }),
  );
  return new Map(entries);
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
  const [myStars, setMyStars] = useState<Map<string, number>>(() => new Map());
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { workflows } = await listSharedWorkflows({
        search: search || undefined,
        starCount: starFilter,
      });
      setItems(workflows);
      setMyStars(await fetchMyStarsForWorkflows(workflows));
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

  const rateWorkflow = async (wf: AgentWorkflow, starCount: number) => {
    if (!wf.user_id || !wf.id) return;
    const k = workflowKey(wf);
    setRatingBusy(k);
    try {
      await setWorkflowStar(wf.user_id, wf.id, { starCount });
      setMyStars((prev) => new Map(prev).set(k, starCount));
      toast.success(t("rating_saved"));
      await load();
    } catch {
      toast.error(t("rating_error"));
    } finally {
      setRatingBusy(null);
    }
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
            return (
              <SharedWorkflowCard
                key={k}
                wf={wf}
                draft={commentDraft.get(k) ?? ""}
                thread={comments.get(k) ?? []}
                avgStars={Math.round(wf.communityStarAvg ?? 0)}
                raterCount={wf.communityStarCount ?? 0}
                myStar={myStars.get(k) ?? 0}
                expanded={expanded === k}
                ratingBusy={ratingBusy === k}
                onDraftChange={(value) => setCommentDraft((prev) => new Map(prev).set(k, value))}
                onRate={(n) => void rateWorkflow(wf, n)}
                onExecute={() => wf.id && wf.user_id && setExecuteTarget({ id: wf.id, ownerId: wf.user_id })}
                onToggleComments={() => void loadCommentsFor(wf)}
                onSubmitComment={() => void submitComment(wf)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
