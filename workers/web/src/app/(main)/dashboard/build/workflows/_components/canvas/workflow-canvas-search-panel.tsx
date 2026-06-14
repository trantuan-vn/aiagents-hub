"use client";

import { useMemo, useState } from "react";

import { Bot, Database, Search, Server, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  WORKFLOW_MEMORY_CATALOG,
  WORKFLOW_NODE_CATALOG,
  WORKFLOW_TOOL_CATALOG,
} from "../catalogs/workflow-component-catalog";

interface WorkflowCanvasSearchPanelProps {
  serviceEndpoint?: string;
  onPickNode: (type: string, label: string, extra?: Record<string, unknown>) => void;
  className?: string;
}

export function WorkflowCanvasSearchPanel({
  serviceEndpoint,
  onPickNode,
  className,
}: WorkflowCanvasSearchPanelProps) {
  const te = useTranslations("WorkflowEditorPage");
  const ta = useTranslations("WorkflowAdminPage");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const nodes = useMemo(() => {
    return WORKFLOW_NODE_CATALOG.filter((n) => {
      const name = te(n.nameKey).toLowerCase();
      return !q || name.includes(q) || n.type.includes(q);
    });
  }, [q, te]);

  const tools = useMemo(() => {
    return WORKFLOW_TOOL_CATALOG.filter((item) => {
      const name = ta(item.nameKey).toLowerCase();
      const desc = ta(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, ta]);

  const memory = useMemo(() => {
    return WORKFLOW_MEMORY_CATALOG.filter((item) => {
      const name = ta(item.nameKey).toLowerCase();
      const desc = ta(item.descKey).toLowerCase();
      return !q || name.includes(q) || desc.includes(q) || item.id.includes(q);
    });
  }, [q, ta]);

  const showService =
    !q ||
    te("search_section_services").toLowerCase().includes(q) ||
    (serviceEndpoint?.toLowerCase().includes(q) ?? false);

  return (
    <div className={cn("flex w-[min(100vw-2rem,360px)] flex-col", className)}>
      <div className="border-border border-b p-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            className="h-9 pl-9 text-sm"
            placeholder={te("search_components_placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <ScrollArea className="max-h-[min(60vh,420px)]">
        <div className="space-y-4 p-2">
          <CatalogSection title={te("search_section_nodes")} icon={Bot} empty={nodes.length === 0}>
            {nodes.map((n) => (
              <CatalogItem
                key={n.type}
                title={te(n.nameKey)}
                subtitle={n.type}
                onClick={() => onPickNode(n.type, te(n.nameKey))}
              />
            ))}
          </CatalogSection>

          <CatalogSection title={te("search_section_tools")} icon={Wrench} empty={tools.length === 0}>
            {tools.map((item) => (
              <CatalogItem
                key={item.id}
                title={ta(item.nameKey)}
                subtitle={ta(item.descKey)}
                onClick={() => onPickNode("tool_node", ta(item.nameKey))}
              />
            ))}
          </CatalogSection>

          <CatalogSection title={te("search_section_memory")} icon={Database} empty={memory.length === 0}>
            {memory.map((item) => (
              <CatalogItem
                key={item.id}
                title={ta(item.nameKey)}
                subtitle={ta(item.descKey)}
                onClick={() => onPickNode("memory_node", ta(item.nameKey))}
              />
            ))}
          </CatalogSection>

          {showService ? (
            <CatalogSection title={te("search_section_services")} icon={Server} empty={!serviceEndpoint}>
              {serviceEndpoint ? (
                <CatalogItem
                  title={serviceEndpoint}
                  subtitle={te("search_service_configured")}
                  onClick={() => onPickNode("service_node", serviceEndpoint)}
                />
              ) : (
                <p className="text-muted-foreground px-2 py-1 text-xs">{te("search_service_empty")}</p>
              )}
            </CatalogSection>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function CatalogSection({
  title,
  icon: Icon,
  empty,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (empty) return null;

  return (
    <section>
      <h3 className="text-muted-foreground mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold tracking-wide uppercase">
        <Icon className="size-3" />
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function CatalogItem({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      className={cn(
        "hover:bg-muted w-full rounded-md px-2 py-1.5 text-left transition-colors",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground line-clamp-2 text-xs">{subtitle}</p>
    </Comp>
  );
}
