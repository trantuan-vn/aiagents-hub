import {
  ArrowRightFromLine,
  Braces,
  ClipboardList,
  FileText,
  FolderUp,
  Globe,
  Hourglass,
  Network,
  SquareArrowOutUpRight,
  Table2,
  Timer,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type WorkflowCoreKindId =
  | "code"
  | "data_table"
  | "http_request"
  | "webhook"
  | "execute_sub_workflow"
  | "execution_data"
  | "ftp"
  | "hub"
  | "hub_form"
  | "no_op"
  | "respond_to_webhook"
  | "track_time_saved"
  | "wait";

export type WorkflowCoreCatalogItem = {
  id: WorkflowCoreKindId;
  nameKey: `core_kind_${WorkflowCoreKindId}`;
  descKey: `core_kind_${WorkflowCoreKindId}_desc`;
  icon: LucideIcon;
  hasSubmenu?: boolean;
  /** Orange trigger badge (e.g. Webhook). */
  isTrigger?: boolean;
};

export const WORKFLOW_CORE_POPULAR: WorkflowCoreCatalogItem[] = [
  {
    id: "code",
    nameKey: "core_kind_code",
    descKey: "core_kind_code_desc",
    icon: Braces,
    hasSubmenu: true,
  },
  {
    id: "data_table",
    nameKey: "core_kind_data_table",
    descKey: "core_kind_data_table_desc",
    icon: Table2,
    hasSubmenu: true,
  },
  {
    id: "http_request",
    nameKey: "core_kind_http_request",
    descKey: "core_kind_http_request_desc",
    icon: Globe,
  },
  {
    id: "webhook",
    nameKey: "core_kind_webhook",
    descKey: "core_kind_webhook_desc",
    icon: Webhook,
    isTrigger: true,
  },
];

export const WORKFLOW_CORE_OTHER: WorkflowCoreCatalogItem[] = [
  {
    id: "execute_sub_workflow",
    nameKey: "core_kind_execute_sub_workflow",
    descKey: "core_kind_execute_sub_workflow_desc",
    icon: SquareArrowOutUpRight,
    hasSubmenu: true,
  },
  {
    id: "execution_data",
    nameKey: "core_kind_execution_data",
    descKey: "core_kind_execution_data_desc",
    icon: FileText,
  },
  {
    id: "ftp",
    nameKey: "core_kind_ftp",
    descKey: "core_kind_ftp_desc",
    icon: FolderUp,
    hasSubmenu: true,
  },
  {
    id: "hub",
    nameKey: "core_kind_hub",
    descKey: "core_kind_hub_desc",
    icon: Network,
    hasSubmenu: true,
  },
  {
    id: "hub_form",
    nameKey: "core_kind_hub_form",
    descKey: "core_kind_hub_form_desc",
    icon: ClipboardList,
  },
  {
    id: "no_op",
    nameKey: "core_kind_no_op",
    descKey: "core_kind_no_op_desc",
    icon: ArrowRightFromLine,
  },
  {
    id: "respond_to_webhook",
    nameKey: "core_kind_respond_to_webhook",
    descKey: "core_kind_respond_to_webhook_desc",
    icon: Webhook,
  },
  {
    id: "track_time_saved",
    nameKey: "core_kind_track_time_saved",
    descKey: "core_kind_track_time_saved_desc",
    icon: Timer,
  },
  {
    id: "wait",
    nameKey: "core_kind_wait",
    descKey: "core_kind_wait_desc",
    icon: Hourglass,
  },
];

export const WORKFLOW_CORE_CATALOG: WorkflowCoreCatalogItem[] = [
  ...WORKFLOW_CORE_POPULAR,
  ...WORKFLOW_CORE_OTHER,
];
