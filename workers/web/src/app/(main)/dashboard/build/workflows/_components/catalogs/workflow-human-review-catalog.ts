import { Inbox, Mail, MessageCircle, Users, type LucideIcon } from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import { siDiscord, siGmail, siGooglechat, siSlack, siTelegram, siWhatsapp } from "simple-icons";

export type HumanReviewChannelId =
  | "chat"
  | "discord"
  | "gmail"
  | "google_chat"
  | "microsoft_outlook"
  | "microsoft_teams"
  | "send_email"
  | "slack"
  | "telegram"
  | "whatsapp_business";

export type HumanReviewChannelItem = {
  id: HumanReviewChannelId;
  nameKey: `human_review_channel_${HumanReviewChannelId}`;
  lucideIcon?: LucideIcon;
  brandIcon?: SimpleIcon;
};

/** Channels for pausing the workflow until a human responds on a messaging surface. */
export const HUMAN_REVIEW_SEND_WAIT_CHANNELS: HumanReviewChannelItem[] = [
  { id: "chat", nameKey: "human_review_channel_chat", lucideIcon: MessageCircle },
  { id: "discord", nameKey: "human_review_channel_discord", brandIcon: siDiscord },
  { id: "gmail", nameKey: "human_review_channel_gmail", brandIcon: siGmail },
  { id: "google_chat", nameKey: "human_review_channel_google_chat", brandIcon: siGooglechat },
  { id: "microsoft_outlook", nameKey: "human_review_channel_microsoft_outlook", lucideIcon: Inbox },
  { id: "microsoft_teams", nameKey: "human_review_channel_microsoft_teams", lucideIcon: Users },
  { id: "send_email", nameKey: "human_review_channel_send_email", lucideIcon: Mail },
  { id: "slack", nameKey: "human_review_channel_slack", brandIcon: siSlack },
  { id: "telegram", nameKey: "human_review_channel_telegram", brandIcon: siTelegram },
  {
    id: "whatsapp_business",
    nameKey: "human_review_channel_whatsapp_business",
    brandIcon: siWhatsapp,
  },
];
