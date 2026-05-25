"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { ServiceEndpointSelect } from "./service-endpoint-select";

export interface WorkflowEditorSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  status: "draft" | "published";
  onStatusChange: (v: "draft" | "published") => void;
  isShared: boolean;
  onSharedChange: (v: boolean) => void;
  starCount: number;
  onStarCountChange: (n: number) => void;
  starLabel: string;
  onStarLabelChange: (s: string) => void;
  serviceEndpoint: string;
  onServiceEndpointChange: (s: string) => void;
}

export function WorkflowEditorSettingsSheet({
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  status,
  onStatusChange,
  isShared,
  onSharedChange,
  starCount,
  onStarCountChange,
  starLabel,
  onStarLabelChange,
  serviceEndpoint,
  onServiceEndpointChange,
}: WorkflowEditorSettingsSheetProps) {
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{te("settings_title")}</SheetTitle>
          <SheetDescription>{te("settings_description")}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="wf-name">{t("name")}</Label>
            <Input id="wf-name" value={name} onChange={(e) => onNameChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-desc">{t("description_field")}</Label>
            <Textarea
              id="wf-desc"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wf-status">
              {t("status_draft")} / {t("status_published")}
            </Label>
            <select
              id="wf-status"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={status}
              onChange={(e) => onStatusChange(e.target.value as "draft" | "published")}
            >
              <option value="draft">{t("status_draft")}</option>
              <option value="published">{t("status_published")}</option>
            </select>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="wf-share">{t("share_toggle")}</Label>
              <Switch
                id="wf-share"
                checked={isShared}
                onCheckedChange={(v) => {
                  onSharedChange(v);
                  if (v) onStatusChange("published");
                }}
              />
            </div>
            <p className="text-muted-foreground text-xs">{t("share_hint")}</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <Label>{t("stars")} (1-5)</Label>
            <Input
              type="number"
              min={0}
              max={5}
              value={starCount}
              onChange={(e) => onStarCountChange(Number(e.target.value))}
            />
            <Label>{t("star_label")}</Label>
            <Input value={starLabel} onChange={(e) => onStarLabelChange(e.target.value)} />
          </div>
          <div className="rounded-lg border p-3">
            <ServiceEndpointSelect value={serviceEndpoint} onChange={onServiceEndpointChange} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
