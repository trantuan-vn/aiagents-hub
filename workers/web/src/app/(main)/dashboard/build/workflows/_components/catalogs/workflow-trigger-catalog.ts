import {
  ArrowRightToLine,
  CheckCheck,
  ClipboardList,
  Clock,
  FolderOpen,
  Hand,
  MessageCircle,
  Radio,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type WorkflowTriggerKindId =
  | "manual"
  | "app_event"
  | "schedule"
  | "webhook"
  | "form"
  | "sub_workflow"
  | "chat"
  | "evaluation"
  | "other";

export type WorkflowTriggerCatalogItem = {
  id: WorkflowTriggerKindId;
  nameKey: `trigger_kind_${WorkflowTriggerKindId}`;
  descKey: `trigger_kind_${WorkflowTriggerKindId}_desc`;
  icon: LucideIcon;
  hasSubmenu?: boolean;
};

export const WORKFLOW_TRIGGER_CATALOG: WorkflowTriggerCatalogItem[] = [
  {
    id: "manual",
    nameKey: "trigger_kind_manual",
    descKey: "trigger_kind_manual_desc",
    icon: Hand,
  },
  {
    id: "app_event",
    nameKey: "trigger_kind_app_event",
    descKey: "trigger_kind_app_event_desc",
    icon: Radio,
    hasSubmenu: true,
  },
  {
    id: "schedule",
    nameKey: "trigger_kind_schedule",
    descKey: "trigger_kind_schedule_desc",
    icon: Clock,
  },
  {
    id: "webhook",
    nameKey: "trigger_kind_webhook",
    descKey: "trigger_kind_webhook_desc",
    icon: Webhook,
  },
  {
    id: "form",
    nameKey: "trigger_kind_form",
    descKey: "trigger_kind_form_desc",
    icon: ClipboardList,
  },
  {
    id: "sub_workflow",
    nameKey: "trigger_kind_sub_workflow",
    descKey: "trigger_kind_sub_workflow_desc",
    icon: ArrowRightToLine,
  },
  {
    id: "chat",
    nameKey: "trigger_kind_chat",
    descKey: "trigger_kind_chat_desc",
    icon: MessageCircle,
  },
  {
    id: "evaluation",
    nameKey: "trigger_kind_evaluation",
    descKey: "trigger_kind_evaluation_desc",
    icon: CheckCheck,
  },
  {
    id: "other",
    nameKey: "trigger_kind_other",
    descKey: "trigger_kind_other_desc",
    icon: FolderOpen,
    hasSubmenu: true,
  },
];

export type WorkflowTriggerAppEventId = "telegram" | "slack" | "discord";

export type WorkflowTriggerAppEventItem = {
  id: WorkflowTriggerAppEventId;
  nameKey: `trigger_app_${WorkflowTriggerAppEventId}`;
  descKey: `trigger_app_${WorkflowTriggerAppEventId}_desc`;
};

export const WORKFLOW_TRIGGER_APP_EVENTS: WorkflowTriggerAppEventItem[] = [
  { id: "telegram", nameKey: "trigger_app_telegram", descKey: "trigger_app_telegram_desc" },
  { id: "slack", nameKey: "trigger_app_slack", descKey: "trigger_app_slack_desc" },
  { id: "discord", nameKey: "trigger_app_discord", descKey: "trigger_app_discord_desc" },
];

export type WorkflowTriggerOtherId = "workflow_error" | "file_change";

export type WorkflowTriggerOtherItem = {
  id: WorkflowTriggerOtherId;
  nameKey: `trigger_other_${WorkflowTriggerOtherId}`;
  descKey: `trigger_other_${WorkflowTriggerOtherId}_desc`;
};

export const WORKFLOW_TRIGGER_OTHER: WorkflowTriggerOtherItem[] = [
  {
    id: "workflow_error",
    nameKey: "trigger_other_workflow_error",
    descKey: "trigger_other_workflow_error_desc",
  },
  {
    id: "file_change",
    nameKey: "trigger_other_file_change",
    descKey: "trigger_other_file_change_desc",
  },
];
