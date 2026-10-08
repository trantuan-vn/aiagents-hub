"use client";

import Link from "next/link";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { AgentWorkflow, CommentEmoji, WorkflowComment } from "../../_lib/api";
import { sharedWorkflowViewHref } from "../../_lib/shared-workflow-utils";

import { StarDisplay } from "./star-display";
import { StarRatingInput } from "./star-rating-input";
import { WorkflowCardActions } from "./workflow-card-actions";
import { WorkflowCommentThread, type CommentDraftInput } from "./workflow-comment-thread";

export interface SharedWorkflowCardProps {
  wf: AgentWorkflow;
  draft: string;
  thread: WorkflowComment[];
  commentCount: number | null;
  avgStars: number;
  raterCount: number;
  myStar: number;
  expanded: boolean;
  commentsLoading: boolean;
  commentSubmitting: boolean;
  ratingBusy: boolean;
  onDraftChange: (value: string) => void;
  onRate: (starCount: number) => void;
  onToggleComments: () => void;
  onSubmitComment: (input: CommentDraftInput) => Promise<boolean | void> | boolean | void;
  onReact: (commentId: string, emoji: CommentEmoji) => void;
}

export function SharedWorkflowCard({
  wf,
  draft,
  thread,
  commentCount,
  avgStars,
  raterCount,
  myStar,
  expanded,
  commentsLoading,
  commentSubmitting,
  ratingBusy,
  onDraftChange,
  onRate,
  onToggleComments,
  onSubmitComment,
  onReact,
}: SharedWorkflowCardProps) {
  const t = useTranslations("WorkflowsPage");
  const viewHref = sharedWorkflowViewHref(wf);
  const me = useDashboardUser();
  const ownedByViewer = Boolean(me?.clientId && wf.user_id && me.clientId === wf.user_id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Link href={viewHref} className="hover:underline">
            {wf.name}
          </Link>
          {ownedByViewer ? <Badge variant="secondary">{t("your_shared_workflow")}</Badge> : null}
        </CardTitle>
        <CardDescription>{wf.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <StarDisplay count={avgStars} />
            <span>{t("rater_count", { count: raterCount })}</span>
          </div>
          {wf.starLabel ? <Badge variant="secondary">{wf.starLabel}</Badge> : null}
          <span>{t("usage_count", { count: wf.usageCount ?? 0 })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">{t("your_rating")}:</span>
          <StarRatingInput value={myStar} disabled={ratingBusy} onChange={onRate} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={viewHref}>{t("view")}</Link>
          </Button>
          <WorkflowCardActions wf={wf} ownerId={wf.user_id} />
          <Button
            size="sm"
            variant={expanded ? "secondary" : "outline"}
            aria-expanded={expanded}
            onClick={onToggleComments}
          >
            <MessageSquare />
            {t("comments")}
            {commentCount != null ? (
              <span className="bg-background text-muted-foreground rounded-full px-1.5 text-[10px] tabular-nums">
                {commentCount}
              </span>
            ) : null}
          </Button>
        </div>
        {expanded ? (
          <WorkflowCommentThread
            draft={draft}
            thread={thread}
            loading={commentsLoading}
            submitting={commentSubmitting}
            onDraftChange={onDraftChange}
            onSubmit={onSubmitComment}
            onReact={onReact}
            feedbackHint={ownedByViewer ? t("community_feedback") : undefined}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
