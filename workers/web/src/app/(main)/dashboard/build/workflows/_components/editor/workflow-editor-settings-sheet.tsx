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
