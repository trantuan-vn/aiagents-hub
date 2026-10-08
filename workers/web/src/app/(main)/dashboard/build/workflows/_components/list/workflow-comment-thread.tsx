"use client";

import { useState } from "react";

import { useLocale, useTranslations } from "next-intl";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { CommentEmoji, WorkflowComment } from "../../_lib/api";

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
];

const REACTIONS: { emoji: CommentEmoji; glyph: string; labelKey: "comment_react_like" | "comment_react_love" | "comment_react_haha" | "comment_react_wow" | "comment_react_sad" }[] = [
  { emoji: "like", glyph: "👍", labelKey: "comment_react_like" },
  { emoji: "love", glyph: "❤️", labelKey: "comment_react_love" },
  { emoji: "haha", glyph: "😄", labelKey: "comment_react_haha" },
  { emoji: "wow", glyph: "😮", labelKey: "comment_react_wow" },
  { emoji: "sad", glyph: "😢", labelKey: "comment_react_sad" },
];

export interface CommentDraftInput {
  content: string;
  parentId?: string | null;
  replyToName?: string | null;
}

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash] ?? AVATAR_TONES[0];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function commentAuthorLabel(identifier: string | undefined): string {
  const value = identifier?.trim() ?? "";
  if (!value) return "";
  if (value.includes(" ")) return value.replace(/\s+/g, " ").trim().slice(0, 80);
  const at = value.indexOf("@");
  const local = at > 0 ? value.slice(0, at) : value;
  const words = local.replace(/[._+\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "";
  return words
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => {
      const lower = word.toLocaleLowerCase();
      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join(" ")
    .slice(0, 80);
}

function commentTime(ts: number, locale: string): { relative: string; absolute: string } {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const date = new Date(ms);
  const diffSec = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const relative =
    abs < 60
      ? rtf.format(diffSec, "second")
      : abs < 3600
        ? rtf.format(Math.round(diffSec / 60), "minute")
        : abs < 86_400
          ? rtf.format(Math.round(diffSec / 3600), "hour")
          : abs < 86_400 * 30
            ? rtf.format(Math.round(diffSec / 86_400), "day")
            : abs < 86_400 * 365
              ? rtf.format(Math.round(diffSec / (86_400 * 30)), "month")
              : rtf.format(Math.round(diffSec / (86_400 * 365)), "year");
  return { relative, absolute: date.toLocaleString(locale) };
}

function AuthorAvatar({ name, size = "md" }: { name: string; size?: "md" | "sm" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-7 text-[10px]" : "size-8 text-[11px]",
        avatarTone(name),
      )}
    >
      {initials(name)}
    </span>
  );
}

function threadGroups(comments: WorkflowComment[]) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const replies = new Map<string, WorkflowComment[]>();
  const roots: WorkflowComment[] = [];
  const chronological = [...comments].reverse();
  for (const comment of chronological) {
    let parentId = comment.parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent?.parentId) parentId = parent.parentId;
    if (!parentId || !byId.has(parentId)) {
      roots.push(comment);
      continue;
    }
    const list = replies.get(parentId) ?? [];
    list.push(comment);
    replies.set(parentId, list);
  }
  return { roots, replies };
}

export function WorkflowCommentThread({
  draft,
  thread,
  loading,
  submitting,
  onDraftChange,
  onSubmit,
  onReact,
  feedbackHint,
}: {
  draft: string;
  thread: WorkflowComment[];
  loading: boolean;
  submitting: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (input: CommentDraftInput) => Promise<boolean | void> | boolean | void;
  onReact: (commentId: string, emoji: CommentEmoji) => void;
  feedbackHint?: string;
}) {
  const t = useTranslations("WorkflowsPage");
  const locale = useLocale();
  const me = useDashboardUser();
  const myName = commentAuthorLabel(me?.identifier);
  const canSend = draft.trim().length > 0 && !submitting;
  const { roots, replies } = threadGroups(thread);
  const [replyingTo, setReplyingTo] = useState<{ parentId: string; replyToName: string | null; label: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const canReply = replyDraft.trim().length > 0 && !submitting;

  const startReply = (parentId: string, label: string, replyToName: string | null) => {
    setReplyingTo({ parentId, label, replyToName });
    setReplyDraft("");
    setCollapsed((current) => {
      if (!current.has(parentId)) return current;
      const next = new Set(current);
      next.delete(parentId);
      return next;
    });
  };

  return (
    <section className="space-y-4 border-t pt-3">
      {feedbackHint ? <p className="text-muted-foreground text-xs">{feedbackHint}</p> : null}
      {loading && thread.length === 0 ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-2.5">
              <div className="bg-muted size-8 animate-pulse rounded-full" />
              <div className="flex-1 space-y-2 py-1">
                <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && thread.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("no_comments")}</p>
      ) : null}

      {roots.length > 0 ? (
        <ul className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
          {roots.map((comment) => {
            const name = comment.authorName.trim() || t("comment_author_unknown");
            const time = comment.createdAt ? commentTime(comment.createdAt, locale) : null;
            const children = replies.get(comment.id) ?? [];
            const isCollapsed = collapsed.has(comment.id);
            const isReplying = replyingTo?.parentId === comment.id;
            return (
              <li key={comment.id || `${name}-${comment.createdAt}`} className="space-y-2">
                <CommentBody
                  comment={comment}
                  name={name}
                  time={time}
                  onReact={onReact}
                  onReply={() => startReply(comment.id, name, null)}
                />
                {children.length > 0 ? (
                  <div className="ml-4">
                    {children.length > 1 ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground mb-2 text-xs font-medium"
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(comment.id)) next.delete(comment.id);
                            else next.add(comment.id);
                            return next;
                          })
                        }
                      >
                        {isCollapsed ? t("comment_show_replies", { count: children.length }) : t("comment_hide_replies")}
                      </button>
                    ) : null}
                    {isCollapsed && children.length > 1 ? null : (
                      <ul className="border-border space-y-3 border-l-2 pl-3">
                        {children.map((reply) => {
                          const replyName = reply.authorName.trim() || t("comment_author_unknown");
                          const replyTime = reply.createdAt ? commentTime(reply.createdAt, locale) : null;
                          return (
                            <li key={reply.id || `${replyName}-${reply.createdAt}`}>
                              <CommentBody
                                comment={reply}
                                name={replyName}
                                time={replyTime}
                                compact
                                onReact={onReact}
                                onReply={() => startReply(comment.id, replyName, replyName)}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
                {isReplying ? (
                  <form
                    className="ml-10 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!canReply || !replyingTo) return;
                      void Promise.resolve(
                        onSubmit({
                          content: replyDraft.trim(),
                          parentId: replyingTo.parentId,
                          replyToName: replyingTo.replyToName,
                        }),
                      )
                        .then((ok) => {
                          if (ok === false) return;
                          setReplyDraft("");
                          setReplyingTo(null);
                        })
                        .catch(() => undefined);
                    }}
                  >
                    <p className="text-muted-foreground text-xs">{t("comment_replying_to", { name: replyingTo.label })}</p>
                    <div className="flex items-end gap-2">
                      <Textarea
                        value={replyDraft}
                        rows={1}
                        autoFocus
                        disabled={submitting}
                        placeholder={t("comment_reply_placeholder")}
                        className="bg-background max-h-28 min-h-10 flex-1 resize-none py-2"
                        onChange={(event) => setReplyDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                          if (event.key === "Escape") setReplyingTo(null);
                        }}
                      />
                      <Button type="submit" size="sm" disabled={!canReply}>
                        {t("comment_reply")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) void onSubmit({ content: draft.trim() });
        }}
      >
        {myName ? <AuthorAvatar name={myName} /> : null}
        <Textarea
          value={draft}
          rows={1}
          disabled={submitting}
          placeholder={t("comment_placeholder")}
          className="bg-background max-h-28 min-h-10 flex-1 resize-none py-2"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) void onSubmit({ content: draft.trim() });
            }
          }}
        />
        <Button type="submit" size="sm" disabled={!canSend} className="shrink-0">
          {t("add_comment")}
        </Button>
      </form>
    </section>
  );
}

function CommentBody({
  comment,
  name,
  time,
  compact = false,
  onReact,
  onReply,
}: {
  comment: WorkflowComment;
  name: string;
  time: { relative: string; absolute: string } | null;
  compact?: boolean;
  onReact: (commentId: string, emoji: CommentEmoji) => void;
  onReply: () => void;
}) {
  const t = useTranslations("WorkflowsPage");
  const counts = new Map((comment.reactions ?? []).map((reaction) => [reaction.emoji, reaction]));
  return (
    <div className="flex gap-2.5">
      <AuthorAvatar name={name} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <div className={cn("bg-muted/60 rounded-2xl rounded-tl-md px-3 py-2", compact && "py-1.5")}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{name}</span>
            {time && comment.createdAt ? (
              <time
                className="text-muted-foreground shrink-0 text-[11px]"
                dateTime={new Date(comment.createdAt < 1e12 ? comment.createdAt * 1000 : comment.createdAt).toISOString()}
                title={time.absolute}
              >
                {time.relative}
              </time>
            ) : null}
          </div>
          {comment.replyToName ? (
            <p className="text-primary mt-0.5 text-xs font-medium">{t("comment_replying_to", { name: comment.replyToName })}</p>
          ) : null}
          <p className="mt-0.5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">{comment.content}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          {REACTIONS.map((reaction) => {
            const state = counts.get(reaction.emoji);
            const mine = Boolean(state?.mine);
            const count = state?.count ?? 0;
            return (
              <button
                key={reaction.emoji}
                type="button"
                aria-pressed={mine}
                aria-label={t(reaction.labelKey)}
                title={t(reaction.labelKey)}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-1.5 text-sm transition-colors",
                  mine ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                  count === 0 && !mine && "opacity-70",
                )}
                onClick={() => onReact(comment.id, reaction.emoji)}
              >
                <span aria-hidden>{reaction.glyph}</span>
                {count > 0 ? <span className="text-[11px] tabular-nums">{count}</span> : null}
              </button>
            );
          })}
          <button type="button" className="text-muted-foreground hover:text-foreground ml-1 text-xs font-medium" onClick={onReply}>
            {t("comment_reply")}
          </button>
        </div>
      </div>
    </div>
  );
}
