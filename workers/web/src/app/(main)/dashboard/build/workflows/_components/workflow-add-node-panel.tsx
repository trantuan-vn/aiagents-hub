"use client";

import { useMemo, useState } from "react";

import {
  BadgeCheck,
  Bot,
  Brain,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Globe,
  Pencil,
  Search,
  Server,
  Wrench,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { SimpleIcon as BrandIcon } from "@/components/simple-icon";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { useApprovedServices } from "./use-approved-services";
import { useWorkflowIntegrations } from "./use-workflow-integrations";
import { ActionAppIcon } from "./workflow-action-app-icon";
import {
  WorkflowActionAppDetailHeader,
  WorkflowActionAppDetailPanel,
} from "./workflow-action-app-detail-panel";
import {
  getActionAppDescription,
  getActionAppTitle,
  isCatalogActionApp,
  resolveActionAppDetail,
  WORKFLOW_ACTION_APP_CATALOG,
  type WorkflowActionAppCatalogItem,
  type WorkflowActionAppRuntimeItem,
} from "./workflow-action-app-catalog";
import {
  WORKFLOW_ADD_NODE_CATEGORIES,
  WORKFLOW_ADD_TRIGGER,
  type WorkflowAddNodeCategory,
} from "./workflow-add-node-catalog";
import {
  WORKFLOW_AGENT_MEMORY_BEGINNERS,
  WORKFLOW_AGENT_MEMORY_OTHER,
  type WorkflowAgentMemoryItem,
} from "./workflow-memory-catalog";
import {
  WORKFLOW_AGENT_MCP_SERVERS,
  WORKFLOW_AGENT_TOOL_CATEGORIES,
  WORKFLOW_AGENT_TOOL_RECOMMENDED,
  WORKFLOW_AGENT_VECTOR_STORES,
  type WorkflowAgentMcpServerItem,
  type WorkflowAgentRecommendedTool,
  type WorkflowAgentToolCategory,
  type WorkflowAgentToolCategoryId,
  type WorkflowAgentVectorStoreItem,
} from "./workflow-tool-catalog";
import {
  HUMAN_REVIEW_SEND_WAIT_CHANNELS,
  type HumanReviewChannelItem,
} from "./workflow-human-review-catalog";
import { WORKFLOW_FLOW_NODE_PALETTE } from "./workflow-node-palette";
import {
  WORKFLOW_CORE_OTHER,
  WORKFLOW_CORE_POPULAR,
  type WorkflowCoreCatalogItem,
} from "./workflow-core-catalog";
import {
  WORKFLOW_FLOW_OTHER,
  WORKFLOW_FLOW_POPULAR,
  type WorkflowFlowCatalogItem,
} from "./workflow-flow-catalog";
import {
  WORKFLOW_TRANSFORM_ADD_REMOVE,
  WORKFLOW_TRANSFORM_COMBINE,
  WORKFLOW_TRANSFORM_CONVERT,
  WORKFLOW_TRANSFORM_OTHER,
  WORKFLOW_TRANSFORM_POPULAR,
  type WorkflowTransformCatalogItem,
} from "./workflow-transform-catalog";
import {
  WORKFLOW_TRIGGER_APP_EVENTS,
  WORKFLOW_TRIGGER_CATALOG,
  WORKFLOW_TRIGGER_OTHER,
  type WorkflowTriggerAppEventItem,
  type WorkflowTriggerCatalogItem,
  type WorkflowTriggerKindId,
  type WorkflowTriggerOtherItem,
} from "./workflow-trigger-catalog";

const FLOW_NODE_TYPES = new Set<string>(WORKFLOW_FLOW_NODE_PALETTE.map((item) => item.type));

export type WorkflowAddNodePick = {
  type: string;
  label: string;
  extra?: Record<string, unknown>;
};

interface WorkflowAddNodePanelProps {
  onPick: (pick: WorkflowAddNodePick) => void;
  allowedNodeTypes?: string[];
  className?: string;
  /** Full canvas toolbar vs connection-handle plus */
  variant?: "full" | "connect";
}

type PanelView =
  | "categories"
  | "ai"
  | "action_in_app"
  | "action_in_app_detail"
  | "memory"
  | "tools"
  | "tools_mcp"
  | "tools_vector_stores"
  | "services"
  | "human_review"
  | "flow"
  | "core"
  | "data_transformation"
  | "triggers"
  | "trigger_app_event"
  | "trigger_other";

export function WorkflowAddNodePanel({
  onPick,
  allowedNodeTypes,
  className,
  variant = "full",
}: WorkflowAddNodePanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PanelView>("categories");
  const [selectedActionApp, setSelectedActionApp] = useState<WorkflowActionAppRuntimeItem | null>(null);
  const [sendWaitExpanded, setSendWaitExpanded] = useState(true);
  const [memoryBeginnersExpanded, setMemoryBeginnersExpanded] = useState(true);
  const [memoryOtherExpanded, setMemoryOtherExpanded] = useState(true);
  const [flowPopularExpanded, setFlowPopularExpanded] = useState(true);
  const [flowOtherExpanded, setFlowOtherExpanded] = useState(true);
  const [corePopularExpanded, setCorePopularExpanded] = useState(true);
  const [coreOtherExpanded, setCoreOtherExpanded] = useState(true);
  const [transformPopularExpanded, setTransformPopularExpanded] = useState(true);
  const [transformAddRemoveExpanded, setTransformAddRemoveExpanded] = useState(true);
  const [transformCombineExpanded, setTransformCombineExpanded] = useState(false);
  const [transformConvertExpanded, setTransformConvertExpanded] = useState(true);
  const [transformOtherExpanded, setTransformOtherExpanded] = useState(true);
  const { services, loading: servicesLoading } = useApprovedServices();
  const { integrations, loading: integrationsLoading } = useWorkflowIntegrations();

  const q = query.trim().toLowerCase();

  const actionApps = useMemo((): WorkflowActionAppRuntimeItem[] => {
    const catalogIds = new Set(WORKFLOW_ACTION_APP_CATALOG.map((a) => a.id));
    const fromApi = integrations
      .filter((i) => !catalogIds.has(i.id))
      .map(
        (i): WorkflowActionAppRuntimeItem => ({
          id: i.id,
          name: i.name,
          description: i.description,
          verified: true,
          hasSubmenu: true,
        }),
      );
    return [...WORKFLOW_ACTION_APP_CATALOG, ...fromApi];
  }, [integrations]);

  const resourceOnly = useMemo(() => {
    if (!allowedNodeTypes?.length) return null;
    if (allowedNodeTypes.length === 1 && allowedNodeTypes[0] === "service_node") return "services" as const;
    if (allowedNodeTypes.length === 1 && allowedNodeTypes[0] === "memory_node") return "memory" as const;
    if (allowedNodeTypes.length === 1 && allowedNodeTypes[0] === "tool_node") return "tools" as const;
    return null;
  }, [allowedNodeTypes]);

  const activeView = view === "categories" && resourceOnly ? resourceOnly : view;
  const fromAgentTools = resourceOnly === "tools";

  const categories = useMemo(() => {
    let list = WORKFLOW_ADD_NODE_CATEGORIES;
    if (variant === "connect" && !allowedNodeTypes?.length) {
      list = list.filter((c) => FLOW_NODE_TYPES.has(c.nodeType) || c.id === "ai");
    }
    if (allowedNodeTypes?.length) {
      return list.filter((c) => {
        if (c.id === "ai") {
          return allowedNodeTypes.some((type) => ["agent", "service_node"].includes(type));
        }
        return allowedNodeTypes.includes(c.nodeType);
      });
    }
    return list;
  }, [allowedNodeTypes, variant]);

  const filteredCategories = useMemo(() => {
    if (!q) return categories;
    return categories.filter((c) => {
      const title = t(c.titleKey).toLowerCase();
      const desc = t(c.descKey).toLowerCase();
      return title.includes(q) || desc.includes(q) || c.nodeType.includes(q);
    });
  }, [categories, q, t]);

  const filteredServices = useMemo(() => {
    if (!q) return services;
    return services.filter((s) => {
      const name = (s.name ?? "").toLowerCase();
      const endpoint = (s.endpoint ?? "").toLowerCase();
      const model = (s.model ?? "").toLowerCase();
      return name.includes(q) || endpoint.includes(q) || model.includes(q);
    });
  }, [services, q]);

  const filterAgentMemory = useMemo(() => {
    return (items: WorkflowAgentMemoryItem[]) =>
      items.filter((item) => {
        const name = t(item.nameKey).toLowerCase();
        const desc = t(item.descKey).toLowerCase();
        return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
      });
  }, [q, t]);

  const filteredMemoryBeginners = useMemo(
    () => filterAgentMemory(WORKFLOW_AGENT_MEMORY_BEGINNERS),
    [filterAgentMemory],
  );

  const filteredMemoryOther = useMemo(
    () => filterAgentMemory(WORKFLOW_AGENT_MEMORY_OTHER),
    [filterAgentMemory],
  );

  const memoryHasResults = filteredMemoryBeginners.length > 0 || filteredMemoryOther.length > 0;

  const filteredRecommendedTools = useMemo(() => {
    return WORKFLOW_AGENT_TOOL_RECOMMENDED.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, t]);

  const filteredToolCategories = useMemo(() => {
    return WORKFLOW_AGENT_TOOL_CATEGORIES.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, t]);

  const filteredMcpServers = useMemo(() => {
    return WORKFLOW_AGENT_MCP_SERVERS.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, t]);

  const filteredVectorStores = useMemo(() => {
    return WORKFLOW_AGENT_VECTOR_STORES.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, t]);

  const toolsHasResults =
    filteredRecommendedTools.length > 0 || filteredToolCategories.length > 0;

  const filteredHumanReviewChannels = useMemo(() => {
    return HUMAN_REVIEW_SEND_WAIT_CHANNELS.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const section = t("human_review_section_send_wait").toLowerCase();
      return !q || name.includes(q) || section.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTriggers = useMemo(() => {
    return WORKFLOW_TRIGGER_CATALOG.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTriggerApps = useMemo(() => {
    return WORKFLOW_TRIGGER_APP_EVENTS.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, t]);

  const filteredTriggerOther = useMemo(() => {
    return WORKFLOW_TRIGGER_OTHER.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredFlowPopular = useMemo(() => {
    return WORKFLOW_FLOW_POPULAR.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredFlowOther = useMemo(() => {
    return WORKFLOW_FLOW_OTHER.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredCorePopular = useMemo(() => {
    return WORKFLOW_CORE_POPULAR.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredCoreOther = useMemo(() => {
    return WORKFLOW_CORE_OTHER.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTransformPopular = useMemo(() => {
    return WORKFLOW_TRANSFORM_POPULAR.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTransformAddRemove = useMemo(() => {
    return WORKFLOW_TRANSFORM_ADD_REMOVE.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTransformCombine = useMemo(() => {
    return WORKFLOW_TRANSFORM_COMBINE.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTransformConvert = useMemo(() => {
    return WORKFLOW_TRANSFORM_CONVERT.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredTransformOther = useMemo(() => {
    return WORKFLOW_TRANSFORM_OTHER.filter((item) => {
      const name = t(item.nameKey).toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [q, t]);

  const filteredActionApps = useMemo(() => {
    return actionApps.filter((item) => {
      const name = (isCatalogActionApp(item) ? t(item.nameKey) : item.name).toLowerCase();
      const desc = (
        isCatalogActionApp(item) ? (item.descKey ? t(item.descKey) : "") : item.description
      ).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.replace(/_/g, " ").includes(q);
    });
  }, [actionApps, q, t]);

  const showTrigger =
    variant === "full" &&
    !allowedNodeTypes?.length &&
    (!q ||
      t(WORKFLOW_ADD_TRIGGER.titleKey).toLowerCase().includes(q) ||
      t(WORKFLOW_ADD_TRIGGER.descKey).toLowerCase().includes(q) ||
      WORKFLOW_ADD_TRIGGER.nodeType.includes(q));

  const title =
    variant === "connect"
      ? t("connect_add_node")
      : activeView === "triggers"
        ? t("what_triggers_workflow")
        : activeView === "trigger_app_event"
          ? t("trigger_kind_app_event")
          : activeView === "trigger_other"
            ? t("trigger_kind_other")
            : activeView === "ai"
              ? t("add_category_ai")
              : activeView === "action_in_app"
                ? t("add_category_action_in_app")
                : activeView === "action_in_app_detail"
                  ? t("action_app_node_details")
                  : activeView === "services"
                ? t("add_ai_services_title")
                : activeView === "memory"
                  ? t("search_section_memory")
                  : activeView === "tools"
                    ? t("search_section_tools")
                    : activeView === "tools_mcp"
                      ? t("tool_category_mcp")
                      : activeView === "tools_vector_stores"
                        ? t("tool_category_vector_stores")
                        : activeView === "human_review"
                      ? t("add_category_human_review")
                      : activeView === "flow"
                        ? t("add_category_flow")
                        : activeView === "core"
                        ? t("add_category_core")
                        : activeView === "data_transformation"
                          ? t("add_category_data_transformation")
                          : t("what_happens_next");

  const showTriggerSubtitle = activeView === "triggers";

  const pickCategory = (category: WorkflowAddNodeCategory) => {
    if (category.id === "ai") {
      setView("ai");
      return;
    }
    if (category.id === "human_review") {
      setView("human_review");
      return;
    }
    if (category.id === "flow") {
      setView("flow");
      return;
    }
    if (category.id === "core") {
      setView("core");
      return;
    }
    if (category.id === "data_transformation") {
      setView("data_transformation");
      return;
    }
    if (category.id === "action_in_app") {
      setView("action_in_app");
      return;
    }
    onPick({ type: category.nodeType, label: t(category.nodeKey) });
  };

  const pickAgentTool = (label: string, toolKind: string, extra?: Record<string, unknown>) => {
    onPick({
      type: "tool_node",
      label,
      extra: { toolKind, catalogId: toolKind, ...extra },
    });
  };

  const pickActionApp = (
    item: WorkflowActionAppRuntimeItem,
    actionId?: string,
    actionLabel?: string,
  ) => {
    const label = actionLabel ?? getActionAppTitle(item, t);
    if (fromAgentTools) {
      pickAgentTool(label, "action_in_app", {
        integrationId: item.id,
        action: actionId ?? item.id,
      });
      return;
    }
    onPick({
      type: "action_in_app",
      label,
      extra: { integrationId: item.id, action: actionId ?? item.id },
    });
  };

  const openActionApp = (item: WorkflowActionAppRuntimeItem) => {
    if (item.hasSubmenu !== false) {
      setSelectedActionApp(item);
      setView("action_in_app_detail");
      setQuery("");
      return;
    }
    pickActionApp(item);
  };

  const selectedActionIntegration = useMemo(() => {
    if (!selectedActionApp) return undefined;
    return integrations.find((i) => i.id === selectedActionApp.id);
  }, [integrations, selectedActionApp]);

  const pickTransformItem = (item: WorkflowTransformCatalogItem) => {
    onPick({
      type: "data_transformation",
      label: t(item.nameKey),
      extra: { transformKind: item.id },
    });
  };

  const pickCoreItem = (item: WorkflowCoreCatalogItem) => {
    onPick({
      type: "core",
      label: t(item.nameKey),
      extra: { coreKind: item.id },
    });
  };

  const pickFlowItem = (item: WorkflowFlowCatalogItem) => {
    onPick({
      type: "flow",
      label: t(item.nameKey),
      extra: { flowKind: item.id },
    });
  };

  const pickHumanReviewChannel = (channel: HumanReviewChannelItem) => {
    const label = t(channel.nameKey);
    if (fromAgentTools) {
      pickAgentTool(label, "human_review", {
        channel: channel.id,
        reviewMode: "send_and_wait",
      });
      return;
    }
    onPick({
      type: "human_review",
      label,
      extra: { channel: channel.id, reviewMode: "send_and_wait" },
    });
  };

  const pickRecommendedTool = (item: WorkflowAgentRecommendedTool) => {
    pickAgentTool(t(item.nameKey), item.id);
  };

  const pickMcpServer = (item: WorkflowAgentMcpServerItem) => {
    pickAgentTool(t(item.nameKey), "mcp", { mcpTransport: item.id });
  };

  const pickVectorStore = (item: WorkflowAgentVectorStoreItem) => {
    pickAgentTool(t(item.nameKey), "vector_store", { vectorStoreId: item.id });
  };

  const openToolCategory = (categoryId: WorkflowAgentToolCategoryId) => {
    if (categoryId === "action_in_app") {
      setView("action_in_app");
      return;
    }
    if (categoryId === "human_review") {
      setView("human_review");
      return;
    }
    if (categoryId === "mcp") {
      setView("tools_mcp");
      return;
    }
    if (categoryId === "vector_stores") {
      setView("tools_vector_stores");
    }
  };

  const pickTrigger = (kind: WorkflowTriggerKindId, label: string, extra?: Record<string, unknown>) => {
    onPick({
      type: WORKFLOW_ADD_TRIGGER.nodeType,
      label,
      extra: { triggerKind: kind, ...extra },
    });
  };

  const pickTriggerCatalogItem = (item: WorkflowTriggerCatalogItem) => {
    if (item.id === "app_event") {
      setView("trigger_app_event");
      return;
    }
    if (item.id === "other") {
      setView("trigger_other");
      return;
    }
    pickTrigger(item.id, t(item.nameKey));
  };

  const pickTriggerApp = (app: WorkflowTriggerAppEventItem) => {
    pickTrigger("app_event", t(app.nameKey), { channel: app.id });
  };

  const pickTriggerOtherItem = (item: WorkflowTriggerOtherItem) => {
    pickTrigger("other", t(item.nameKey), { otherKind: item.id });
  };

  const pickAgent = () => {
    onPick({ type: "agent", label: t("node_agent") });
  };

  const pickService = (endpoint: string, name: string) => {
    onPick({
      type: "service_node",
      label: name,
      extra: { serviceEndpoint: endpoint, catalogId: endpoint },
    });
  };

  const pickMemory = (item: WorkflowAgentMemoryItem) => {
    onPick({
      type: "memory_node",
      label: t(item.nameKey),
      extra: { catalogId: item.id, memoryKind: item.id },
    });
  };

  const goBack = () => {
    if (resourceOnly && !fromAgentTools) return;
    if (activeView === "action_in_app_detail") {
      setSelectedActionApp(null);
      setView("action_in_app");
      setQuery("");
      return;
    }
    if (fromAgentTools) {
      if (
        activeView === "action_in_app" ||
        activeView === "human_review" ||
        activeView === "tools_mcp" ||
        activeView === "tools_vector_stores"
      ) {
        setView("tools");
        setQuery("");
        setSendWaitExpanded(true);
        return;
      }
      return;
    }
    if (activeView === "trigger_app_event" || activeView === "trigger_other") {
      setView("triggers");
      setQuery("");
      return;
    }
    setView("categories");
    setQuery("");
    setSendWaitExpanded(true);
    setFlowPopularExpanded(true);
    setFlowOtherExpanded(true);
    setCorePopularExpanded(true);
    setCoreOtherExpanded(true);
    setTransformPopularExpanded(true);
    setTransformAddRemoveExpanded(true);
    setTransformCombineExpanded(false);
    setTransformConvertExpanded(true);
    setTransformOtherExpanded(true);
    setMemoryBeginnersExpanded(true);
    setMemoryOtherExpanded(true);
  };

  const showBack =
    activeView !== "categories" && (!resourceOnly || fromAgentTools);

  const HeaderIcon =
    activeView === "human_review"
      ? CheckCircle2
      : activeView === "flow"
        ? GitBranch
        : activeView === "core"
          ? Briefcase
          : activeView === "data_transformation"
            ? Pencil
            : activeView === "ai"
              ? Bot
              : activeView === "action_in_app"
                ? Globe
                : activeView === "memory"
                  ? Brain
                  : activeView === "tools" ||
                      activeView === "tools_mcp" ||
                      activeView === "tools_vector_stores"
                    ? Wrench
                    : null;

  const hideSearch = activeView === "action_in_app_detail";

  const detailDocsUrl = selectedActionApp
    ? resolveActionAppDetail(selectedActionApp, selectedActionIntegration).docsUrl
    : undefined;

  return (
    <div className={cn("flex w-[min(100vw-2rem,380px)] flex-col", className)}>
      <div className="border-border border-b px-3 py-2.5">
        <div className="mb-2 flex items-center gap-1">
          {showBack ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:bg-muted -ml-1 rounded-md p-1"
              aria-label={t("add_back")}
              onClick={goBack}
            >
              <ChevronLeft className="size-4" />
            </button>
          ) : null}
          {HeaderIcon ? <HeaderIcon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            {showTriggerSubtitle ? (
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{t("trigger_starts_workflow")}</p>
            ) : null}
          </div>
          {activeView === "action_in_app_detail" ? (
            <WorkflowActionAppDetailHeader docsUrl={detailDocsUrl} />
          ) : null}
        </div>
        {!hideSearch ? (
          <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              className="h-9 border-violet-500/40 pl-9 text-sm focus-visible:ring-violet-500/30"
              placeholder={t("add_node_search_placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        ) : null}
      </div>

      <ScrollArea className="max-h-[min(60vh,440px)]">
        {activeView === "categories" ? (
          <div className="p-1">
            {filteredCategories.map((category, index) => (
              <CategoryRow
                key={category.id}
                icon={category.icon}
                title={t(category.titleKey)}
                description={t(category.descKey)}
                highlighted={index === 0 && category.id === "ai"}
                hasSubmenu={
                  category.id === "ai" ||
                  category.id === "action_in_app" ||
                  category.id === "human_review" ||
                  category.id === "flow" ||
                  category.id === "core" ||
                  category.id === "data_transformation"
                }
                onClick={() => pickCategory(category)}
              />
            ))}

            {showTrigger ? (
              <>
                <div className="bg-border my-1 h-px" />
                <CategoryRow
                  icon={WORKFLOW_ADD_TRIGGER.icon}
                  title={t(WORKFLOW_ADD_TRIGGER.titleKey)}
                  description={t(WORKFLOW_ADD_TRIGGER.descKey)}
                  hasSubmenu
                  onClick={() => setView("triggers")}
                />
              </>
            ) : null}

            {filteredCategories.length === 0 && !showTrigger ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "action_in_app" ? (
          <div className="p-1">
            {integrationsLoading ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">{t("action_app_loading")}</p>
            ) : filteredActionApps.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : (
              filteredActionApps.map((app) => (
                <ActionAppRow
                  key={app.id}
                  item={app}
                  title={getActionAppTitle(app, t)}
                  description={getActionAppDescription(app, t)}
                  verified={app.verified}
                  hasSubmenu={app.hasSubmenu}
                  verifiedLabel={t("action_app_verified")}
                  onClick={() => openActionApp(app)}
                />
              ))
            )}
          </div>
        ) : null}

        {activeView === "action_in_app_detail" && selectedActionApp ? (
          <WorkflowActionAppDetailPanel
            item={selectedActionApp}
            integration={selectedActionIntegration}
            onPickAction={(actionId, actionLabel) => pickActionApp(selectedActionApp, actionId, actionLabel)}
          />
        ) : null}

        {activeView === "ai" ? (
          <div className="p-1">
            <PickRow
              icon={Bot}
              title={t("node_agent")}
              description={t("add_category_ai_desc")}
              onClick={pickAgent}
            />
            <CategoryRow
              icon={Server}
              title={t("add_ai_services_title")}
              description={t("add_ai_services_desc")}
              hasSubmenu
              onClick={() => setView("services")}
            />
          </div>
        ) : null}

        {activeView === "services" ? (
          <div className="p-1">
            {servicesLoading ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">{t("service_select_loading")}</p>
            ) : filteredServices.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">{t("service_select_empty")}</p>
            ) : (
              filteredServices.map((s) => (
                <PickRow
                  key={String(s.id ?? s.endpoint)}
                  icon={Server}
                  title={s.name}
                  description={s.model ? `${s.model} · ${s.endpoint}` : s.endpoint}
                  onClick={() => pickService(s.endpoint, s.name)}
                />
              ))
            )}
          </div>
        ) : null}

        {activeView === "memory" ? (
          <div className="pb-1">
            <div
              className="mx-2 mt-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
              role="note"
            >
              {t("memory_connect_intro")}
            </div>
            <div className="p-1">
              <MemorySection
                title={t("memory_section_beginners")}
                expanded={memoryBeginnersExpanded}
                onToggle={() => setMemoryBeginnersExpanded((v) => !v)}
              >
                {filteredMemoryBeginners.map((item) => (
                  <MemoryItemRow
                    key={item.id}
                    item={item}
                    title={t(item.nameKey)}
                    description={t(item.descKey)}
                    onClick={() => pickMemory(item)}
                  />
                ))}
              </MemorySection>
              <MemorySection
                title={t("memory_section_other")}
                expanded={memoryOtherExpanded}
                onToggle={() => setMemoryOtherExpanded((v) => !v)}
              >
                {filteredMemoryOther.map((item) => (
                  <MemoryItemRow
                    key={item.id}
                    item={item}
                    title={t(item.nameKey)}
                    description={t(item.descKey)}
                    onClick={() => pickMemory(item)}
                  />
                ))}
              </MemorySection>
              {!memoryHasResults ? (
                <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeView === "tools" ? (
          <div className="p-1">
            {filteredRecommendedTools.map((item, index) => (
              <ToolRecommendedRow
                key={item.id}
                icon={item.icon}
                title={t(item.nameKey)}
                description={t(item.descKey)}
                highlighted={index === 0}
                onClick={() => pickRecommendedTool(item)}
              />
            ))}
            {filteredRecommendedTools.length > 0 && filteredToolCategories.length > 0 ? (
              <div className="bg-border my-1 h-px" />
            ) : null}
            {filteredToolCategories.map((category) => (
              <ToolCategoryRow
                key={category.id}
                category={category}
                title={t(category.nameKey)}
                description={t(category.descKey)}
                badgeNewLabel={t("badge_new")}
                onClick={() => openToolCategory(category.id)}
              />
            ))}
            {!toolsHasResults ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "tools_mcp" ? (
          <div className="p-1">
            {filteredMcpServers.map((item) => (
              <PickRow
                key={item.id}
                icon={item.icon}
                title={t(item.nameKey)}
                description={t(item.descKey)}
                onClick={() => pickMcpServer(item)}
              />
            ))}
            {filteredMcpServers.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "tools_vector_stores" ? (
          <div className="p-1">
            {filteredVectorStores.map((item) => (
              <VectorStoreItemRow
                key={item.id}
                item={item}
                title={t(item.nameKey)}
                description={t(item.descKey)}
                onClick={() => pickVectorStore(item)}
              />
            ))}
            {filteredVectorStores.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "human_review" ? (
          <div className="p-1">
            <button
              type="button"
              className="text-muted-foreground hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-medium tracking-wide uppercase"
              onClick={() => setSendWaitExpanded((v) => !v)}
              aria-expanded={sendWaitExpanded}
            >
              {t("human_review_section_send_wait")}
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </button>
            {sendWaitExpanded ? (
              <div className="pb-1">
                {filteredHumanReviewChannels.map((channel) => (
                  <HumanReviewChannelRow
                    key={channel.id}
                    channel={channel}
                    title={t(channel.nameKey)}
                    onClick={() => pickHumanReviewChannel(channel)}
                  />
                ))}
                {filteredHumanReviewChannels.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeView === "flow" ? (
          <div className="p-1">
            <FlowSection
              title={t("flow_section_popular")}
              expanded={flowPopularExpanded}
              onToggle={() => setFlowPopularExpanded((v) => !v)}
            >
              {filteredFlowPopular.map((item, index) => (
                <FlowItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  highlighted={index === 0}
                  onClick={() => pickFlowItem(item)}
                />
              ))}
            </FlowSection>
            <FlowSection
              title={t("flow_section_other")}
              expanded={flowOtherExpanded}
              onToggle={() => setFlowOtherExpanded((v) => !v)}
            >
              {filteredFlowOther.map((item) => (
                <FlowItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  onClick={() => pickFlowItem(item)}
                />
              ))}
            </FlowSection>
            {filteredFlowPopular.length === 0 && filteredFlowOther.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "core" ? (
          <div className="p-1">
            <FlowSection
              title={t("flow_section_popular")}
              expanded={corePopularExpanded}
              onToggle={() => setCorePopularExpanded((v) => !v)}
            >
              {filteredCorePopular.map((item, index) => (
                <CoreItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  highlighted={index === 0}
                  hasSubmenu={item.hasSubmenu}
                  isTrigger={item.isTrigger}
                  onClick={() => pickCoreItem(item)}
                />
              ))}
            </FlowSection>
            <FlowSection
              title={t("flow_section_other")}
              expanded={coreOtherExpanded}
              onToggle={() => setCoreOtherExpanded((v) => !v)}
            >
              {filteredCoreOther.map((item) => (
                <CoreItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  hasSubmenu={item.hasSubmenu}
                  isTrigger={item.isTrigger}
                  onClick={() => pickCoreItem(item)}
                />
              ))}
            </FlowSection>
            {filteredCorePopular.length === 0 && filteredCoreOther.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "data_transformation" ? (
          <div className="p-1">
            <FlowSection
              title={t("transform_section_popular")}
              expanded={transformPopularExpanded}
              onToggle={() => setTransformPopularExpanded((v) => !v)}
            >
              {filteredTransformPopular.map((item, index) => (
                <TransformItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  highlighted={index === 0}
                  hasSubmenu={item.hasSubmenu}
                  onClick={() => pickTransformItem(item)}
                />
              ))}
            </FlowSection>
            <FlowSection
              title={t("transform_section_add_remove")}
              expanded={transformAddRemoveExpanded}
              onToggle={() => setTransformAddRemoveExpanded((v) => !v)}
            >
              {filteredTransformAddRemove.map((item) => (
                <TransformItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  hasSubmenu={item.hasSubmenu}
                  onClick={() => pickTransformItem(item)}
                />
              ))}
            </FlowSection>
            <FlowSection
              title={t("transform_section_combine")}
              expanded={transformCombineExpanded}
              onToggle={() => setTransformCombineExpanded((v) => !v)}
            >
              {filteredTransformCombine.map((item) => (
                <TransformItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  onClick={() => pickTransformItem(item)}
                />
              ))}
            </FlowSection>
            <FlowSection
              title={t("transform_section_convert")}
              expanded={transformConvertExpanded}
              onToggle={() => setTransformConvertExpanded((v) => !v)}
            >
              {filteredTransformConvert.map((item) => (
                <TransformItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  hasSubmenu={item.hasSubmenu}
                  onClick={() => pickTransformItem(item)}
                />
              ))}
            </FlowSection>
            <FlowSection
              title={t("transform_section_other")}
              expanded={transformOtherExpanded}
              onToggle={() => setTransformOtherExpanded((v) => !v)}
            >
              {filteredTransformOther.map((item) => (
                <TransformItemRow
                  key={item.id}
                  icon={item.icon}
                  title={t(item.nameKey)}
                  description={t(item.descKey)}
                  onClick={() => pickTransformItem(item)}
                />
              ))}
            </FlowSection>
            {filteredTransformPopular.length === 0 &&
            filteredTransformAddRemove.length === 0 &&
            filteredTransformCombine.length === 0 &&
            filteredTransformConvert.length === 0 &&
            filteredTransformOther.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "triggers" ? (
          <div className="p-1">
            {filteredTriggers.map((item) => (
              <CategoryRow
                key={item.id}
                icon={item.icon}
                title={t(item.nameKey)}
                description={t(item.descKey)}
                hasSubmenu={item.hasSubmenu}
                onClick={() => pickTriggerCatalogItem(item)}
              />
            ))}
            {filteredTriggers.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "trigger_app_event" ? (
          <div className="p-1">
            {filteredTriggerApps.map((app) => (
              <PickRow
                key={app.id}
                title={t(app.nameKey)}
                description={t(app.descKey)}
                onClick={() => pickTriggerApp(app)}
              />
            ))}
            {filteredTriggerApps.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}

        {activeView === "trigger_other" ? (
          <div className="p-1">
            {filteredTriggerOther.map((item) => (
              <PickRow
                key={item.id}
                title={t(item.nameKey)}
                description={t(item.descKey)}
                onClick={() => pickTriggerOtherItem(item)}
              />
            ))}
            {filteredTriggerOther.length === 0 ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}

function CategoryRow({
  icon: Icon,
  title,
  description,
  highlighted,
  hasSubmenu,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  highlighted?: boolean;
  hasSubmenu?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
        highlighted && "border-l-[3px] border-l-orange-500 pl-[calc(0.5rem-3px)]",
      )}
      onClick={onClick}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
      {hasSubmenu ? <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" /> : null}
    </button>
  );
}

function HumanReviewChannelRow({
  channel,
  title,
  onClick,
}: {
  channel: HumanReviewChannelItem;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors"
      onClick={onClick}
    >
      <ChannelIcon channel={channel} />
      <span className="text-sm font-medium">{title}</span>
    </button>
  );
}

function ChannelIcon({ channel }: { channel: HumanReviewChannelItem }) {
  if (channel.brandIcon) {
    return <BrandIcon icon={channel.brandIcon} className="size-5 shrink-0" />;
  }
  const Icon = channel.lucideIcon;
  if (!Icon) return null;
  return <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />;
}

function MemorySection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className="text-foreground hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-semibold"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {title}
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded ? <div className="pb-1">{children}</div> : null}
    </>
  );
}

function MemoryItemRow({
  item,
  title,
  description,
  onClick,
}: {
  item: WorkflowAgentMemoryItem;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
      onClick={onClick}
    >
      <MemoryItemIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
    </button>
  );
}

function MemoryItemIcon({ item }: { item: WorkflowAgentMemoryItem }) {
  if (item.customIcon === "xata") {
    return (
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-[#9f8fef] text-[10px] font-bold text-white"
        aria-hidden
      >
        X
      </span>
    );
  }
  if (item.brandIcon) {
    return <BrandIcon icon={item.brandIcon} className="mt-0.5 size-5 shrink-0" />;
  }
  const Icon = item.lucideIcon;
  if (!Icon) return null;
  return <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />;
}

function FlowSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs font-medium tracking-wide uppercase"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {title}
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded ? <div className="pb-1">{children}</div> : null}
    </>
  );
}

function FlowItemRow({
  icon: Icon,
  title,
  description,
  highlighted,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
        highlighted && "border-l-[3px] border-l-orange-500 pl-[calc(0.5rem-3px)]",
      )}
      onClick={onClick}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
    </button>
  );
}

function TransformItemRow({
  icon: Icon,
  title,
  description,
  highlighted,
  hasSubmenu,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  highlighted?: boolean;
  hasSubmenu?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
        highlighted && "border-l-[3px] border-l-orange-500 pl-[calc(0.5rem-3px)]",
      )}
      onClick={onClick}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
      {hasSubmenu ? <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" /> : null}
    </button>
  );
}

function CoreItemRow({
  icon: Icon,
  title,
  description,
  highlighted,
  hasSubmenu,
  isTrigger,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  highlighted?: boolean;
  hasSubmenu?: boolean;
  isTrigger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
        highlighted && "border-l-[3px] border-l-orange-500 pl-[calc(0.5rem-3px)]",
      )}
      onClick={onClick}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{title}</span>
          {isTrigger ? <Zap className="size-3.5 shrink-0 text-orange-500" aria-hidden /> : null}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
      {hasSubmenu ? <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" /> : null}
    </button>
  );
}

function ActionAppRow({
  item,
  title,
  description,
  verified,
  hasSubmenu,
  verifiedLabel,
  onClick,
}: {
  item: WorkflowActionAppRuntimeItem;
  title: string;
  description?: string;
  verified?: boolean;
  hasSubmenu?: boolean;
  verifiedLabel: string;
  onClick: () => void;
}) {
  const catalogItem = isCatalogActionApp(item) ? (item as WorkflowActionAppCatalogItem) : null;

  return (
    <button
      type="button"
      className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
      onClick={onClick}
    >
      <ActionAppIcon item={catalogItem} className="mt-0.5 size-5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{title}</span>
          {verified ? (
            <BadgeCheck className="size-3.5 shrink-0 fill-foreground text-background" aria-label={verifiedLabel} />
          ) : null}
        </span>
        {description ? (
          <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
        ) : null}
      </span>
      {hasSubmenu ? <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" /> : null}
    </button>
  );
}

function ToolRecommendedRow({
  icon: Icon,
  title,
  description,
  highlighted,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
        highlighted && "border-l-[3px] border-l-orange-500 pl-[calc(0.5rem-3px)]",
      )}
      onClick={onClick}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
    </button>
  );
}

function ToolCategoryRow({
  category,
  title,
  description,
  badgeNewLabel,
  onClick,
}: {
  category: WorkflowAgentToolCategory;
  title: string;
  description: string;
  badgeNewLabel: string;
  onClick: () => void;
}) {
  const Icon = category.icon;
  return (
    <button
      type="button"
      className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
      onClick={onClick}
    >
      <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{title}</span>
          {category.badgeNew ? (
            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {badgeNewLabel}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
      <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
    </button>
  );
}

function VectorStoreItemRow({
  item,
  title,
  description,
  onClick,
}: {
  item: WorkflowAgentVectorStoreItem;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
      onClick={onClick}
    >
      <VectorStoreItemIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
    </button>
  );
}

function VectorStoreItemIcon({ item }: { item: WorkflowAgentVectorStoreItem }) {
  if (item.brandIcon) {
    return <BrandIcon icon={item.brandIcon} className="mt-0.5 size-5 shrink-0" />;
  }
  const Icon = item.lucideIcon;
  if (!Icon) return null;
  return <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />;
}

function PickRow({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors"
      onClick={onClick}
    >
      {Icon ? <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
      </span>
    </button>
  );
}
