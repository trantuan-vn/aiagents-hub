/** Human-review messaging channels — single source of truth for catalog + definitions. */
export const HUMAN_REVIEW_CHANNELS = [
  "chat",
  "discord",
  "gmail",
  "google_chat",
  "microsoft_outlook",
  "microsoft_teams",
  "send_email",
  "slack",
  "telegram",
  "whatsapp_business",
] as const;

export type HumanReviewChannel = (typeof HUMAN_REVIEW_CHANNELS)[number];

/** Kind field stored on `node.data` for human_review. */
export const HUMAN_REVIEW_KIND_FIELD = "channel" as const;
