"use client";

import { useMemo, useState } from "react";

import { Bot, ChevronLeft, ChevronRight, Search, Server } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { useApprovedServices } from "./use-approved-services";
import {
  WORKFLOW_ADD_NODE_CATEGORIES,
  WORKFLOW_ADD_TRIGGER,
  type WorkflowAddNodeCategory,
} from "./workflow-add-node-catalog";
import { WORKFLOW_MEMORY_CATALOG, WORKFLOW_TOOL_CATALOG } from "./workflow-component-catalog";
import { WORKFLOW_FLOW_NODE_PALETTE } from "./workflow-node-palette";

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

type PanelView = "categories" | "ai" | "memory" | "tools" | "services";

export function WorkflowAddNodePanel({
  onPick,
  allowedNodeTypes,
  className,
  variant = "full",
}: WorkflowAddNodePanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const ta = useTranslations("WorkflowAdminPage");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PanelView>("categories");
  const { services, loading: servicesLoading } = useApprovedServices();

  const q = query.trim().toLowerCase();

  const resourceOnly = useMemo(() => {
    if (!allowedNodeTypes?.length) return null;
    if (allowedNodeTypes.length === 1 && allowedNodeTypes[0] === "service_node") return "services" as const;
    if (allowedNodeTypes.length === 1 && allowedNodeTypes[0] === "memory_node") return "memory" as const;
    if (allowedNodeTypes.length === 1 && allowedNodeTypes[0] === "tool_node") return "tools" as const;
    return null;
  }, [allowedNodeTypes]);

  const activeView = view === "categories" && resourceOnly ? resourceOnly : view;

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

  const filteredMemory = useMemo(() => {
    return WORKFLOW_MEMORY_CATALOG.filter((item) => {
      const name = ta(item.nameKey).toLowerCase();
      const desc = ta(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, ta]);

  const filteredTools = useMemo(() => {
    return WORKFLOW_TOOL_CATALOG.filter((item) => {
      const name = ta(item.nameKey).toLowerCase();
      const desc = ta(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, ta]);

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
      : activeView === "ai"
        ? t("add_category_ai")
        : activeView === "services"
          ? t("add_ai_services_title")
          : activeView === "memory"
            ? t("search_section_memory")
            : activeView === "tools"
              ? t("search_section_tools")
              : t("what_happens_next");

  const pickCategory = (category: WorkflowAddNodeCategory) => {
    if (category.id === "ai") {
      setView("ai");
      return;
    }
    onPick({ type: category.nodeType, label: t(category.nodeKey) });
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

  const goBack = () => {
    if (resourceOnly) return;
    setView("categories");
    setQuery("");
  };

  const showBack = activeView !== "categories" && !resourceOnly;

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
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
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
                hasSubmenu={category.id === "ai"}
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
                  onClick={() =>
                    onPick({ type: WORKFLOW_ADD_TRIGGER.nodeType, label: t(WORKFLOW_ADD_TRIGGER.nodeKey) })
                  }
                />
              </>
            ) : null}

            {filteredCategories.length === 0 && !showTrigger ? (
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">{t("add_node_no_results")}</p>
            ) : null}
          </div>
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
          <div className="p-1">
            {filteredMemory.map((item) => (
              <PickRow
                key={item.id}
                title={ta(item.nameKey)}
                description={ta(item.descKey)}
                onClick={() => onPick({ type: "memory_node", label: ta(item.nameKey) })}
              />
            ))}
          </div>
        ) : null}

        {activeView === "tools" ? (
          <div className="p-1">
            {filteredTools.map((item) => (
              <PickRow
                key={item.id}
                title={ta(item.nameKey)}
                description={ta(item.descKey)}
                onClick={() => onPick({ type: "tool_node", label: ta(item.nameKey) })}
              />
            ))}
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
