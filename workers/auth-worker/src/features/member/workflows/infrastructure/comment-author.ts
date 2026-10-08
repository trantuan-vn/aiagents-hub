import { COMMENT_EMOJIS } from '../domain/domain.js';

export type CommentEmoji = (typeof COMMENT_EMOJIS)[number];

export interface CommentReactionCount {
  emoji: CommentEmoji;
  count: number;
  mine: boolean;
}

/** Public comment row returned to community viewers. Never includes email or user id. */
export interface PublicWorkflowComment {
  id: string;
  parentId: string | null;
  replyToName: string | null;
  content: string;
  authorName: string;
  createdAt: number | null;
  reactions: CommentReactionCount[];
}

/**
 * Turn an email or stored label into a short public name.
 * `cunkem@example.com` becomes `Cunkem`. Full addresses are not returned.
 */
export function publicAuthorLabel(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.includes(" ")) {
    return clampLabel(value);
  }
  const at = value.indexOf("@");
  const local = at > 0 ? value.slice(0, at) : value;
  const words = local.replace(/[._+\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "";
  const titled = words
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => {
      const lower = word.toLocaleLowerCase();
      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join(" ");
  return clampLabel(titled);
}

function clampLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function isCommentEmoji(value: unknown): value is CommentEmoji {
  return typeof value === "string" && (COMMENT_EMOJIS as readonly string[]).includes(value);
}

export function commentPublicId(row: Record<string, unknown>): string {
  const key = typeof row.commentKey === "string" ? row.commentKey.trim() : "";
  if (key) return key;
  const raw = row.globalId ?? row.id;
  if (raw == null || raw === "") return "";
  return String(raw);
}

/**
 * Prefer the viewer's Durable Object reaction over the D1 copy, which can lag the queue.
 * `viewerMine === undefined` means the DO was not read. `null` means the viewer cleared it.
 */
export function applyViewerReactions(
  reactions: CommentReactionCount[],
  d1Mine: CommentEmoji | null,
  viewerMine: CommentEmoji | null | undefined,
): CommentReactionCount[] {
  if (viewerMine === undefined || viewerMine === d1Mine) return reactions;
  const next = reactions.map((reaction) => ({ ...reaction, mine: reaction.emoji === d1Mine ? false : reaction.mine }));
  if (d1Mine) {
    const previous = next.find((reaction) => reaction.emoji === d1Mine);
    if (previous) previous.count = Math.max(0, previous.count - 1);
  }
  if (viewerMine) {
    const current = next.find((reaction) => reaction.emoji === viewerMine);
    if (current) {
      current.count += 1;
      current.mine = true;
    } else {
      next.push({ emoji: viewerMine, count: 1, mine: true });
    }
  }
  return next.filter((reaction) => reaction.count > 0);
}

export function toPublicWorkflowComment(
  row: Record<string, unknown>,
  reactions: CommentReactionCount[] = [],
): PublicWorkflowComment {
  const stored = publicAuthorLabel(row.authorDisplayName);
  const fromAccount = publicAuthorLabel(row.authorIdentifier);
  const createdRaw = row.created_at ?? row.createdAt;
  const createdNum = typeof createdRaw === "number" ? createdRaw : Number(createdRaw);
  const parentRaw = typeof row.parentCommentKey === "string" ? row.parentCommentKey.trim() : "";
  const replyTo = publicAuthorLabel(row.replyToName);
  return {
    id: commentPublicId(row),
    parentId: parentRaw || null,
    replyToName: replyTo || null,
    content: typeof row.content === "string" ? row.content : "",
    authorName: stored || fromAccount,
    createdAt: Number.isFinite(createdNum) && createdNum > 0 ? createdNum : null,
    reactions,
  };
}
