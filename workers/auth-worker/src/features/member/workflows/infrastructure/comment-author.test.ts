import { describe, expect, it } from "vitest";

import { applyViewerReactions, publicAuthorLabel, toPublicWorkflowComment } from "./comment-author.js";

describe("publicAuthorLabel", () => {
  it("uses the mailbox name instead of the full email", () => {
    expect(publicAuthorLabel("cunkem@example.com")).toBe("Cunkem");
    expect(publicAuthorLabel("jane.doe+work@example.com")).toBe("Jane Doe Work");
  });

  it("keeps an explicit display name", () => {
    expect(publicAuthorLabel("Nguyễn An")).toBe("Nguyễn An");
  });

  it("returns empty for missing values", () => {
    expect(publicAuthorLabel("")).toBe("");
    expect(publicAuthorLabel(null)).toBe("");
  });
});

describe("toPublicWorkflowComment", () => {
  it("prefers a stored name and hides the account email", () => {
    const comment = toPublicWorkflowComment({
      globalId: 12,
      content: "Chạy khá OK",
      authorDisplayName: "Lan",
      authorIdentifier: "lan@example.com",
      created_at: 1_700_000_000_000,
      user_id: "secret-user",
    });
    expect(comment).toEqual({
      id: "12",
      parentId: null,
      replyToName: null,
      content: "Chạy khá OK",
      authorName: "Lan",
      createdAt: 1_700_000_000_000,
      reactions: [],
    });
    expect(JSON.stringify(comment)).not.toContain("lan@example.com");
    expect(JSON.stringify(comment)).not.toContain("secret-user");
  });

  it("keeps a reply attached to its parent comment", () => {
    const comment = toPublicWorkflowComment({
      commentKey: "11111111-1111-4111-8111-111111111111",
      parentCommentKey: "12",
      replyToName: "Lan",
      content: "Đồng ý",
      authorDisplayName: "Minh",
      created_at: 20,
    });
    expect(comment.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(comment.parentId).toBe("12");
    expect(comment.replyToName).toBe("Lan");
  });
});

describe("applyViewerReactions", () => {
  it("replaces a lagging reaction with the viewer's latest choice", () => {
    const reactions = applyViewerReactions(
      [{ emoji: "like", count: 2, mine: true }],
      "like",
      "sad",
    );
    expect(reactions).toEqual([
      { emoji: "like", count: 1, mine: false },
      { emoji: "sad", count: 1, mine: true },
    ]);
  });

  it("drops a reaction the viewer turned off", () => {
    expect(applyViewerReactions([{ emoji: "haha", count: 1, mine: true }], "haha", null)).toEqual([]);
  });
});
