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

export interface WorkflowEditorSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  isShared: boolean;
  onSharedChange: (v: boolean) => void;
  minPlanId: "free" | "starter" | "pro" | "business";
  onMinPlanIdChange: (v: "free" | "starter" | "pro" | "business") => void;
  maxAssignableMinPlanId?: "free" | "starter" | "pro" | "business";
  graceWhenExhausted: boolean;
  onGraceWhenExhaustedChange: (v: boolean) => void;
  canGraceWhenExhausted?: boolean;
  starCount: number;
  onStarCountChange: (n: number) => void;
  starLabel: string;
  onStarLabelChange: (s: string) => void;
  descriptionInputRef?: React.RefObject<HTMLTextAreaElement>;
}

export function WorkflowEditorSettingsSheet({
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  isShared,
  onSharedChange,
  minPlanId,
  onMinPlanIdChange,
  maxAssignableMinPlanId = "free",
  graceWhenExhausted,
  onGraceWhenExhaustedChange,
  canGraceWhenExhausted = false,
  starCount,
  onStarCountChange,
  starLabel,
  onStarLabelChange,
  descriptionInputRef,
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
              ref={descriptionInputRef}
              id="wf-desc"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="wf-share">{t("share_toggle")}</Label>
              <Switch id="wf-share" checked={isShared} onCheckedChange={onSharedChange} />
            </div>
            <p className="text-muted-foreground text-xs">{t("share_hint")}</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="wf-min-plan">{t("min_plan")}</Label>
            <select
              id="wf-min-plan"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={minPlanId}
              onChange={(e) => onMinPlanIdChange(e.target.value as "free" | "starter" | "pro" | "business")}
            >
              {(["free", "starter", "pro", "business"] as const)
                .filter((id) => ["free", "starter", "pro", "business"].indexOf(id) <= ["free", "starter", "pro", "business"].indexOf(maxAssignableMinPlanId))
                .map((id) => (
                  <option key={id} value={id}>
                    {t(`plan_${id}`)}
                  </option>
                ))}
            </select>
            <p className="text-muted-foreground text-xs">{t("min_plan_hint")}</p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="wf-grace">{t("grace_toggle")}</Label>
              <Switch
                id="wf-grace"
                checked={graceWhenExhausted}
                disabled={!canGraceWhenExhausted}
                onCheckedChange={onGraceWhenExhaustedChange}
              />
            </div>
            <p className="text-muted-foreground text-xs">{t("grace_hint")}</p>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
