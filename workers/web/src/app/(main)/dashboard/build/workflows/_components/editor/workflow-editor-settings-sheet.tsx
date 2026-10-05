"use client";

import {
  Check,
  ClipboardList,
  FileText,
  Globe,
  MessageSquare,
  MousePointerClick,
  Settings2,
  Star,
  Webhook,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { PUBLIC_TRIGGER_KINDS, type PublicTriggerKind } from "../../_lib/public-trigger-kinds";
import { WorkflowEnterpriseSection } from "./workflow-enterprise-section";

const PLAN_IDS = ["free", "starter", "pro", "business"] as const;
type PlanId = (typeof PLAN_IDS)[number];

const TRIGGER_ICONS: Record<PublicTriggerKind, typeof Webhook> = {
  manual: MousePointerClick,
  chat: MessageSquare,
  form: ClipboardList,
  webhook: Webhook,
};

export interface WorkflowEditorSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  isShared: boolean;
  onSharedChange: (v: boolean) => void;
  canShareWorkflows?: boolean;
  minPlanId: PlanId;
  onMinPlanIdChange: (v: PlanId) => void;
  maxAssignableMinPlanId?: PlanId;
  graceWhenExhausted: boolean;
  onGraceWhenExhaustedChange: (v: boolean) => void;
  canGraceWhenExhausted?: boolean;
  publicTriggerKinds: PublicTriggerKind[] | null;
  onPublicTriggerKindsChange: (v: PublicTriggerKind[]) => void;
  triggerKindsInWorkflow?: Set<PublicTriggerKind>;
  starCount: number;
  onStarCountChange: (n: number) => void;
  starLabel: string;
  onStarLabelChange: (s: string) => void;
  descriptionInputRef?: React.RefObject<HTMLTextAreaElement>;
  workflowId?: number;
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
  canShareWorkflows = true,
  minPlanId,
  onMinPlanIdChange,
  maxAssignableMinPlanId = "free",
  graceWhenExhausted,
  onGraceWhenExhaustedChange,
  canGraceWhenExhausted = false,
  publicTriggerKinds,
  onPublicTriggerKindsChange,
  triggerKindsInWorkflow,
  starCount,
  onStarCountChange,
  starLabel,
  onStarLabelChange,
  descriptionInputRef,
  workflowId,
}: WorkflowEditorSettingsSheetProps) {
  const t = useTranslations("WorkflowsPage");
  const te = useTranslations("WorkflowEditorPage");
  const maxPlanIndex = PLAN_IDS.indexOf(maxAssignableMinPlanId);
  const plans = PLAN_IDS.filter((_, index) => index <= maxPlanIndex);
  const stars = Math.min(5, Math.max(0, starCount));
  const allowedTriggerKinds = publicTriggerKinds ?? [...PUBLIC_TRIGGER_KINDS];
  const toggleTriggerKind = (kind: PublicTriggerKind) => {
    onPublicTriggerKindsChange(
      allowedTriggerKinds.includes(kind)
        ? allowedTriggerKinds.filter((k) => k !== kind)
        : PUBLIC_TRIGGER_KINDS.filter((k) => k === kind || allowedTriggerKinds.includes(k)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
          <div className="flex items-start gap-3 text-left">
            <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Settings2 className="size-5" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{te("settings_title")}</DialogTitle>
              <DialogDescription>{te("settings_description")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <SettingsSection icon={FileText} title={te("settings_section_identity")}>
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
                rows={3}
                className="resize-none"
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={Globe} title={te("settings_section_access")}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="wf-share">{t("share_toggle")}</Label>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {canShareWorkflows ? t("share_hint") : t("share_requires_plan")}
                </p>
              </div>
              <Switch
                id="wf-share"
                className="mt-0.5"
                checked={isShared}
                disabled={!canShareWorkflows}
                onCheckedChange={onSharedChange}
              />
            </div>
            <div className="space-y-2">
              <Label id="wf-min-plan-label">{t("min_plan")}</Label>
              <div
                role="radiogroup"
                aria-labelledby="wf-min-plan-label"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {plans.map((id) => {
                  const selected = minPlanId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background text-foreground hover:bg-accent",
                      )}
                      onClick={() => onMinPlanIdChange(id)}
                    >
                      {t(`plan_${id}`)}
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">{t("min_plan_hint")}</p>
            </div>
            <div className="space-y-2">
              <Label id="wf-public-triggers-label">{t("public_triggers")}</Label>
              <div
                role="group"
                aria-labelledby="wf-public-triggers-label"
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {PUBLIC_TRIGGER_KINDS.map((kind) => {
                  const Icon = TRIGGER_ICONS[kind];
                  const checked = allowedTriggerKinds.includes(kind);
                  const inWorkflow = triggerKindsInWorkflow?.has(kind) ?? true;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        checked ? "border-primary bg-primary/10" : "bg-background hover:bg-accent",
                        !inWorkflow && "opacity-60",
                      )}
                      onClick={() => toggleTriggerKind(kind)}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md",
                          checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{t(`public_trigger_${kind}`)}</span>
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                              checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                            )}
                          >
                            {checked ? <Check className="size-3" /> : null}
                          </span>
                        </span>
                        <span className="text-muted-foreground block text-xs leading-relaxed">
                          {inWorkflow ? t(`public_trigger_${kind}_desc`) : t("public_trigger_not_in_workflow")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p
                className={cn(
                  "text-xs leading-relaxed",
                  allowedTriggerKinds.length === 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {allowedTriggerKinds.length === 0 ? t("public_triggers_none") : t("public_triggers_hint")}
              </p>
            </div>
          </SettingsSection>

          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsSection icon={Zap} title={te("settings_section_runtime")}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="wf-grace">{t("grace_toggle")}</Label>
                  <p className="text-muted-foreground text-xs leading-relaxed">{t("grace_hint")}</p>
                </div>
                <Switch
                  id="wf-grace"
                  className="mt-0.5"
                  checked={graceWhenExhausted}
                  disabled={!canGraceWhenExhausted}
                  onCheckedChange={onGraceWhenExhaustedChange}
                />
              </div>
            </SettingsSection>

            <SettingsSection icon={Star} title={te("settings_section_discovery")}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label id="wf-stars-label">{t("stars")}</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">{stars}/5</span>
                </div>
                <div role="radiogroup" aria-labelledby="wf-stars-label" className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={stars === n}
                      aria-label={String(n)}
                      className="text-muted-foreground focus-visible:ring-ring rounded-md p-1 transition-colors hover:text-amber-400 focus-visible:ring-2 focus-visible:outline-none"
                      onClick={() => onStarCountChange(stars === n ? 0 : n)}
                    >
                      <Star className={cn("size-5", n <= stars && "fill-amber-400 text-amber-400")} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wf-star-label">{t("star_label")}</Label>
                <Input id="wf-star-label" value={starLabel} onChange={(e) => onStarLabelChange(e.target.value)} />
              </div>
            </SettingsSection>
          </div>

          {open && workflowId && workflowId > 0 ? <WorkflowEnterpriseSection workflowId={workflowId} /> : null}
        </div>

        <DialogFooter className="bg-muted/30 shrink-0 border-t px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {te("settings_done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-md">
          <Icon className="size-3.5" />
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="bg-muted/25 space-y-4 rounded-xl border p-4">{children}</div>
    </section>
  );
}
