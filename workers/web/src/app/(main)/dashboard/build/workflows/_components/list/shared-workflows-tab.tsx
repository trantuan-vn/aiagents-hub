"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  getWorkflowStar,
  listComments,
  listSharedWorkflows,
  postComment,
  setCommentReaction,
  setWorkflowStar,
  type AgentWorkflow,
  type CommentEmoji,
  type WorkflowComment,
} from "../../_lib/api";
import { workflowKey } from "../../_lib/shared-workflow-utils";

import { SharedWorkflowCard } from "./shared-workflow-card";
import { commentAuthorLabel, type CommentDraftInput } from "./workflow-comment-thread";

function normalizeComment(comment: WorkflowComment): WorkflowComment {
  return {
    ...comment,
    parentId: comment.parentId ?? null,
    replyToName: comment.replyToName ?? null,
    reactions: comment.reactions ?? [],
  };
}

function mergeCommentThread(server: WorkflowComment[], current: WorkflowComment[]): WorkflowComment[] {
  const ids = new Set(server.map((comment) => comment.id));
  const pending = current.filter((comment) => comment.id && !ids.has(comment.id));
  return [...pending, ...server.map(normalizeComment)];
}

function withReaction(comments: WorkflowComment[], commentId: string, emoji: CommentEmoji): WorkflowComment[] {
  return comments.map((comment) => {
    if (comment.id !== commentId) return comment;
    const reactions = (comment.reactions ?? []).map((reaction) => ({ ...reaction }));
    const mine = reactions.find((reaction) => reaction.mine);
    for (const reaction of reactions) {
      if (!reaction.mine) continue;
      reaction.mine = false;
      reaction.count = Math.max(0, reaction.count - 1);
    }
    if (mine?.emoji !== emoji) {
      const target = reactions.find((reaction) => reaction.emoji === emoji);
      if (target) {
        target.count += 1;
        target.mine = true;
      } else {
        reactions.push({ emoji, count: 1, mine: true });
      }
    }
    return { ...comment, reactions: reactions.filter((reaction) => reaction.count > 0) };
  });
}

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
  const me = useDashboardUser();
  const [items, setItems] = useState<AgentWorkflow[]>([]);
  const [search, setSearch] = useState("");
  const [starFilter, setStarFilter] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [commentDraft, setCommentDraft] = useState<Map<string, string>>(() => new Map());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comments, setComments] = useState<Map<string, WorkflowComment[]>>(() => new Map());
  const [commentsLoading, setCommentsLoading] = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null);
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
    setCommentsLoading(k);
    try {
      const { comments: rows } = await listComments(wf.user_id, wf.id);
      setComments((prev) => new Map(prev).set(k, mergeCommentThread(rows, prev.get(k) ?? [])));
    } catch {
      toast.error(t("load_error"));
    } finally {
      setCommentsLoading((current) => (current === k ? null : current));
    }
  };

  const toggleComments = (wf: AgentWorkflow) => {
    const k = workflowKey(wf);
    if (expanded === k) {
      setExpanded(null);
      return;
    }
    setExpanded(k);
    void loadCommentsFor(wf);
  };

  const submitComment = async (wf: AgentWorkflow, input: CommentDraftInput) => {
    if (!wf.user_id || !wf.id) return;
    const k = workflowKey(wf);
    const content = input.content.trim();
    if (!content || commentSubmitting === k) return;
    setCommentSubmitting(k);
    try {
      const id = crypto.randomUUID();
      await postComment(wf.user_id, wf.id, {
        content,
        commentKey: id,
        parentCommentKey: input.parentId || undefined,
        replyToName: input.replyToName || undefined,
      });
      const posted: WorkflowComment = {
        id,
        parentId: input.parentId ?? null,
        replyToName: input.replyToName ?? null,
        content,
        authorName: commentAuthorLabel(me?.identifier),
        createdAt: Date.now(),
        reactions: [],
      };
      if (!input.parentId) {
        setCommentDraft((prev) => {
          const next = new Map(prev);
          next.set(k, "");
          return next;
        });
      }
      setComments((prev) => {
        const next = new Map(prev);
        next.set(k, [posted, ...(prev.get(k) ?? [])]);
        return next;
      });
      toast.success(t("comment_posted"));
      return true;
    } catch {
      toast.error(t("comment_error"));
      return false;
    } finally {
      setCommentSubmitting((current) => (current === k ? null : current));
    }
  };

  const reactToComment = async (wf: AgentWorkflow, commentId: string, emoji: CommentEmoji) => {
    if (!wf.user_id || !wf.id || !commentId) return;
    const k = workflowKey(wf);
    const current = comments.get(k) ?? [];
    const mine = current.find((comment) => comment.id === commentId)?.reactions.find((reaction) => reaction.mine);
    const nextEmoji = mine?.emoji === emoji ? null : emoji;
    setComments((prev) => new Map(prev).set(k, withReaction(prev.get(k) ?? [], commentId, emoji)));
    try {
      await setCommentReaction(wf.user_id, wf.id, { commentKey: commentId, emoji: nextEmoji });
    } catch {
      setComments((prev) => new Map(prev).set(k, current));
      toast.error(t("comment_react_error"));
    }
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
                commentCount={
                  comments.has(k)
                    ? Math.max(comments.get(k)?.length ?? 0, wf.commentCount ?? 0)
                    : typeof wf.commentCount === "number"
                      ? wf.commentCount
                      : null
                }
                avgStars={Math.round(wf.communityStarAvg ?? 0)}
                raterCount={wf.communityStarCount ?? 0}
                myStar={myStars.get(k) ?? 0}
                expanded={expanded === k}
                commentsLoading={commentsLoading === k}
                commentSubmitting={commentSubmitting === k}
                ratingBusy={ratingBusy === k}
                onDraftChange={(value) => setCommentDraft((prev) => new Map(prev).set(k, value))}
                onRate={(n) => void rateWorkflow(wf, n)}
                onToggleComments={() => toggleComments(wf)}
                onSubmitComment={(input) => void submitComment(wf, input)}
                onReact={(commentId, emoji) => void reactToComment(wf, commentId, emoji)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
