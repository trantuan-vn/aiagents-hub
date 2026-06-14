"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { NodePalette } from "../node-ui/node-palette";
import { ServiceEndpointSelect } from "../node-ui/service-endpoint-select";

interface SharePanelProps {
  isShared?: boolean;
  onSharedChange: (v: boolean) => void;
}

function SharePanel({ isShared, onSharedChange }: SharePanelProps) {
  const tw = useTranslations("WorkflowsPage");
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="share">{tw("share_toggle")}</Label>
        <Switch id="share" checked={!!isShared} onCheckedChange={onSharedChange} />
      </div>
      <p className="text-muted-foreground text-xs">{tw("share_hint")}</p>
    </div>
  );
}

interface StarPanelProps {
  starCount: number;
  starLabel: string;
  onStarCountChange: (n: number) => void;
  onStarLabelChange?: (s: string) => void;
}

function StarPanel({ starCount, starLabel, onStarCountChange, onStarLabelChange }: StarPanelProps) {
  const tw = useTranslations("WorkflowsPage");
  return (
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
  );
}

interface ServiceEndpointPanelProps {
  serviceEndpoint: string;
  onServiceEndpointChange: (s: string) => void;
}

function ServiceEndpointPanel({ serviceEndpoint, onServiceEndpointChange }: ServiceEndpointPanelProps) {
  return (
    <div className="rounded-lg border p-3">
      <ServiceEndpointSelect value={serviceEndpoint} onChange={onServiceEndpointChange} />
    </div>
  );
}

export interface WorkflowEditorSidebarProps {
  isShared?: boolean;
  onSharedChange?: (v: boolean) => void;
  starCount: number;
  onStarCountChange?: (n: number) => void;
  starLabel: string;
  onStarLabelChange?: (s: string) => void;
  serviceEndpoint: string;
  onServiceEndpointChange?: (s: string) => void;
  onAddNode: (type: string, label: string, extra?: Record<string, unknown>) => void;
}

export function WorkflowEditorSidebar(props: WorkflowEditorSidebarProps) {
  const {
    isShared,
    onSharedChange,
    starCount,
    onStarCountChange,
    starLabel,
    onStarLabelChange,
    serviceEndpoint,
    onServiceEndpointChange,
    onAddNode,
  } = props;

  return (
    <div className="space-y-4">
      <NodePalette onAdd={onAddNode} />
      {onSharedChange != null ? <SharePanel isShared={isShared} onSharedChange={onSharedChange} /> : null}
      {onStarCountChange != null ? (
        <StarPanel
          starCount={starCount}
          starLabel={starLabel}
          onStarCountChange={onStarCountChange}
          onStarLabelChange={onStarLabelChange}
        />
      ) : null}
      {onServiceEndpointChange != null ? (
        <ServiceEndpointPanel serviceEndpoint={serviceEndpoint} onServiceEndpointChange={onServiceEndpointChange} />
      ) : null}
    </div>
  );
}
