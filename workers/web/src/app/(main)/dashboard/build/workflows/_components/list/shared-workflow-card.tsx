"use client";

import Link from "next/link";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";

import type { AgentWorkflow } from "../../_lib/api";
import { sharedWorkflowChatHref, sharedWorkflowViewHref } from "../../_lib/shared-workflow-utils";

import { StarDisplay } from "./star-display";
import { StarRatingInput } from "./star-rating-input";

export interface SharedWorkflowCardProps {
  wf: AgentWorkflow;
  draft: string;
  thread: Record<string, unknown>[];
  avgStars: number;
  raterCount: number;
  myStar: number;
  expanded: boolean;
  ratingBusy: boolean;
  onDraftChange: (value: string) => void;
  onRate: (starCount: number) => void;
  onExecute: () => void;
  onToggleComments: () => void;
  onSubmitComment: () => void;
}

export function SharedWorkflowCard({
  wf,
  draft,
  thread,
  avgStars,
  raterCount,
  myStar,
  expanded,
  ratingBusy,
  onDraftChange,
  onRate,
  onExecute,
  onToggleComments,
  onSubmitComment,
}: SharedWorkflowCardProps) {
  const t = useTranslations("WorkflowsPage");
  const viewHref = sharedWorkflowViewHref(wf);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <Link href={viewHref} className="hover:underline">
            {wf.name}
          </Link>
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
          <span>
            {t("usage_count")}: {wf.usageCount ?? 0}
          </span>
          <span>
            {t("earnings")}: {formatUsd(wf.totalEarningsUsd ?? 0)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">{t("your_rating")}:</span>
          <StarRatingInput value={myStar} disabled={ratingBusy} onChange={onRate} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={viewHref}>{t("view")}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={sharedWorkflowChatHref(wf)}>{t("open_chat")}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onExecute}>
            {t("execute")}
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleComments}>
            {t("comments")}
          </Button>
        </div>
        {expanded ? (
          <div className="space-y-2 border-t pt-3">
            {thread.map((c) => (
              <div key={String(c.id ?? c.globalId ?? c.created_at)} className="bg-muted/50 rounded-md p-2 text-sm">
                <p>{String(c.content ?? "")}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={draft} onChange={(e) => onDraftChange(e.target.value)} placeholder={t("add_comment")} />
              <Button size="sm" onClick={onSubmitComment}>
                {t("add_comment")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
