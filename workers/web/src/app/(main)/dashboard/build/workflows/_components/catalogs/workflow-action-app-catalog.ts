import { Globe, Wallet, type LucideIcon } from "lucide-react";
import type { SimpleIcon } from "simple-icons";

import type { IntegrationPreset } from "../../_lib/api";
import {
  siDiscord,
  siGithub,
  siGooglesheets,
  siNotion,
  siOpenai,
  siSlack,
  siTelegram,
} from "simple-icons";

export type WorkflowActionAppCatalogId =
  | "oneshot_api"
  | "twocaptcha"
  | "twochat"
  | "abyssale"
  | "actaport"
  | "action_network"
  | "activecampaign"
  | "activitysmith"
  | "acuity_scheduling"
  | "adalo"
  | "add_to_wallet"
  | "google_sheets"
  | "slack"
  | "telegram"
  | "notion"
  | "github"
  | "discord"
  | "openai"
  | "sendgrid"
  | "http";

export type WorkflowActionAppAction = {
  id: string;
  /** WorkflowEditorPage message key, e.g. action_app_add_to_wallet_action_create_pass */
  nameKey: `action_app_${string}`;
};

export type WorkflowActionAppDetailMeta = {
  docsUrl?: string;
  author?: string;
  authorKey?: `action_app_author_${string}`;
  usageCount?: number;
  actions: WorkflowActionAppAction[];
  /** Larger icon in the detail header (e.g. wallet apps). */
  detailIcon?: LucideIcon;
  detailIconClassName?: string;
};

export type WorkflowActionAppCatalogItem = {
  id: WorkflowActionAppCatalogId | string;
  nameKey: `action_app_${string}`;
  descKey?: `action_app_${string}_desc`;
  brandIcon?: SimpleIcon;
  lucideIcon?: LucideIcon;
  verified?: boolean;
  hasSubmenu?: boolean;
};

const DEFAULT_ACTION: WorkflowActionAppAction = {
  id: "default",
  nameKey: "action_app_action_default",
};

/** Curated app list for the “Action in an app” picker (n8n-style). */
export const WORKFLOW_ACTION_APP_CATALOG: WorkflowActionAppCatalogItem[] = [
  {
    id: "oneshot_api",
    nameKey: "action_app_oneshot_api",
    descKey: "action_app_oneshot_api_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "twocaptcha",
    nameKey: "action_app_twocaptcha",
    descKey: "action_app_twocaptcha_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "twochat",
    nameKey: "action_app_twochat",
    descKey: "action_app_twochat_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "abyssale",
    nameKey: "action_app_abyssale",
    descKey: "action_app_abyssale_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "actaport",
    nameKey: "action_app_actaport",
    descKey: "action_app_actaport_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "action_network",
    nameKey: "action_app_action_network",
    lucideIcon: Globe,
    hasSubmenu: true,
  },
  {
    id: "activecampaign",
    nameKey: "action_app_activecampaign",
    lucideIcon: Globe,
    hasSubmenu: true,
  },
  {
    id: "activitysmith",
    nameKey: "action_app_activitysmith",
    descKey: "action_app_activitysmith_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "acuity_scheduling",
    nameKey: "action_app_acuity_scheduling",
    lucideIcon: Globe,
    hasSubmenu: true,
  },
  {
    id: "adalo",
    nameKey: "action_app_adalo",
    lucideIcon: Globe,
    hasSubmenu: true,
  },
  {
    id: "add_to_wallet",
    nameKey: "action_app_add_to_wallet",
    descKey: "action_app_add_to_wallet_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "google_sheets",
    nameKey: "action_app_google_sheets",
    descKey: "action_app_google_sheets_desc",
    brandIcon: siGooglesheets,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "slack",
    nameKey: "action_app_slack",
    descKey: "action_app_slack_desc",
    brandIcon: siSlack,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "telegram",
    nameKey: "action_app_telegram",
    descKey: "action_app_telegram_desc",
    brandIcon: siTelegram,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "notion",
    nameKey: "action_app_notion",
    descKey: "action_app_notion_desc",
    brandIcon: siNotion,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "github",
    nameKey: "action_app_github",
    descKey: "action_app_github_desc",
    brandIcon: siGithub,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "discord",
    nameKey: "action_app_discord",
    descKey: "action_app_discord_desc",
    brandIcon: siDiscord,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "openai",
    nameKey: "action_app_openai",
    descKey: "action_app_openai_desc",
    brandIcon: siOpenai,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "sendgrid",
    nameKey: "action_app_sendgrid",
    descKey: "action_app_sendgrid_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
  {
    id: "http",
    nameKey: "action_app_http",
    descKey: "action_app_http_desc",
    lucideIcon: Globe,
    verified: true,
    hasSubmenu: true,
  },
];

/** Per-app metadata for the node details screen. */
export const WORKFLOW_ACTION_APP_DETAILS: Partial<Record<string, WorkflowActionAppDetailMeta>> = {
  add_to_wallet: {
    docsUrl: "https://addtowallet.com",
    authorKey: "action_app_author_add_to_wallet",
    usageCount: 9,
    detailIcon: Wallet,
    detailIconClassName: "bg-violet-600 text-white",
    actions: [{ id: "create_pass", nameKey: "action_app_add_to_wallet_action_create_pass" }],
  },
  slack: {
    docsUrl: "https://api.slack.com/messaging/webhooks",
    authorKey: "action_app_author_slack",
    usageCount: 42,
    actions: [{ id: "post_message", nameKey: "action_app_slack_action_post_message" }],
  },
  telegram: {
    docsUrl: "https://core.telegram.org/bots/api",
    authorKey: "action_app_author_telegram",
    usageCount: 38,
    actions: [{ id: "send_message", nameKey: "action_app_telegram_action_send_message" }],
  },
  notion: {
    docsUrl: "https://developers.notion.com",
    authorKey: "action_app_author_notion",
    usageCount: 24,
    actions: [{ id: "create_page", nameKey: "action_app_notion_action_create_page" }],
  },
  github: {
    docsUrl: "https://docs.github.com/rest",
    authorKey: "action_app_author_github",
    usageCount: 31,
    actions: [{ id: "create_issue", nameKey: "action_app_github_action_create_issue" }],
  },
  openai: {
    docsUrl: "https://platform.openai.com/docs",
    authorKey: "action_app_author_openai",
    usageCount: 56,
    actions: [{ id: "chat_completion", nameKey: "action_app_openai_action_chat_completion" }],
  },
  http: {
    docsUrl: "https://developer.mozilla.org/docs/Web/HTTP",
    authorKey: "action_app_author_http",
    usageCount: 120,
    actions: [{ id: "request", nameKey: "action_app_http_action_request" }],
  },
};

export function resolveActionAppDetail(
  item: WorkflowActionAppRuntimeItem,
  integration?: IntegrationPreset,
): WorkflowActionAppDetailMeta {
  const fromCatalog = WORKFLOW_ACTION_APP_DETAILS[item.id];
  if (fromCatalog) return fromCatalog;

  if (integration) {
    return {
      docsUrl: integration.docsUrl,
      author: integration.name,
      usageCount: undefined,
      actions: [{ id: "default", nameKey: "action_app_action_default" }],
    };
  }

  return { actions: [DEFAULT_ACTION] };
}

export type WorkflowActionAppRuntimeItem =
  | WorkflowActionAppCatalogItem
  | {
      id: string;
      name: string;
      description: string;
      verified?: boolean;
      hasSubmenu?: boolean;
    };

export function isCatalogActionApp(
  item: WorkflowActionAppRuntimeItem,
): item is WorkflowActionAppCatalogItem {
  return "nameKey" in item;
}

export function getActionAppTitle(
  item: WorkflowActionAppRuntimeItem,
  t: (key: string) => string,
): string {
  return isCatalogActionApp(item) ? t(item.nameKey) : item.name;
}

export function getActionAppDescription(
  item: WorkflowActionAppRuntimeItem,
  t: (key: string) => string,
): string | undefined {
  if (isCatalogActionApp(item)) {
    return item.descKey ? t(item.descKey) : undefined;
  }
  return item.description;
}
