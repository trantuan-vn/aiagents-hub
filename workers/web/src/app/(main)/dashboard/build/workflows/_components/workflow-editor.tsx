"use client";

import { useCallback, useMemo } from "react";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { NodePalette } from "./node-palette";
import { WorkflowCanvas, addNodeToDefinition, type WorkflowDefinition } from "./workflow-canvas";

interface WorkflowEditorProps {
  definitionJson: string;
  onDefinitionChange: (json: string) => void;
  isShared?: boolean;
  onSharedChange?: (v: boolean) => void;
  starCount?: number;
  onStarCountChange?: (n: number) => void;
  starLabel?: string;
  onStarLabelChange?: (s: string) => void;
  serviceEndpoint?: string;
  onServiceEndpointChange?: (s: string) => void;
}

function parseDef(json: string): WorkflowDefinition {
  try {
    const p = JSON.parse(json) as WorkflowDefinition;
    return { nodes: p.nodes ?? [], edges: p.edges ?? [], viewport: p.viewport };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function WorkflowEditor({
  definitionJson,
  onDefinitionChange,
  isShared,
  onSharedChange,
  starCount = 0,
  onStarCountChange,
  starLabel = "",
  onStarLabelChange,
  serviceEndpoint = "",
  onServiceEndpointChange,
}: WorkflowEditorProps) {
  const t = useTranslations("WorkflowEditorPage");
  const tw = useTranslations("WorkflowsPage");
  const definition = useMemo(() => parseDef(definitionJson), [definitionJson]);

  const sync = useCallback(
    (next: WorkflowDefinition) => {
      onDefinitionChange(JSON.stringify(next));
    },
    [onDefinitionChange],
  );

  const onAddNode = (type: string, label: string) => {
    const extra =
      type === "agent" && serviceEndpoint
        ? { serviceEndpoint, memoryCollection: "vectorize-default", tools: [] }
        : undefined;
    sync(addNodeToDefinition(definition, type, label, extra));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <div className="space-y-4">
        <NodePalette onAdd={onAddNode} />
        {onSharedChange != null && (
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <Label htmlFor="share">{tw("share_toggle")}</Label>
            <Switch id="share" checked={!!isShared} onCheckedChange={onSharedChange} />
          </div>
        )}
        {onStarCountChange != null && (
          <div className="space-y-2 rounded-lg border p-3">
            <Label>{tw("stars")} (1-5)</Label>
            <Input
              type="number"
              min={0}
              max={5}
              value={starCount}
              onChange={(e) => onStarCountChange(Number(e.target.value))}
            />
            <Label>{tw("star_label")}</Label>
            <Input value={starLabel} onChange={(e) => onStarLabelChange?.(e.target.value)} />
          </div>
        )}
        {onServiceEndpointChange != null && (
          <div className="space-y-2 rounded-lg border p-3">
            <Label>{t("agent_service_endpoint")}</Label>
            <Input
              value={serviceEndpoint}
              onChange={(e) => onServiceEndpointChange(e.target.value)}
              placeholder="/api/..."
            />
            <p className="text-muted-foreground text-xs">{t("agent_model_hint")}</p>
          </div>
        )}
      </div>
      <WorkflowCanvas initial={definition} onChange={sync} />
    </div>
  );
}
