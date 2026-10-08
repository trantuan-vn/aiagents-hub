"use client";

import { useState } from "react";

import { Check, ClipboardList, MessageSquare, MousePointerClick, Plus, Trash2, Webhook, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { PUBLIC_TRIGGER_KINDS, type PublicTriggerKind } from "../../_lib/public-trigger-kinds";
import { emptyUserGrant, isShareEmail, type ShareAudience, type ShareGrant } from "../../_lib/share-grants";

const MAX_GRANTS = 20;
const MAX_EMAILS = 30;

const TRIGGER_ICONS: Record<PublicTriggerKind, typeof Webhook> = {
  manual: MousePointerClick,
  chat: MessageSquare,
  form: ClipboardList,
  webhook: Webhook,
};

export function WorkflowShareGrantsEditor({
  grants,
  onChange,
  triggerKindsInWorkflow,
}: {
  grants: ShareGrant[];
  onChange: (grants: ShareGrant[]) => void;
  triggerKindsInWorkflow?: Set<PublicTriggerKind>;
}) {
  const t = useTranslations("WorkflowsPage");
  const update = (id: string, next: ShareGrant) => onChange(grants.map((grant) => (grant.id === id ? next : grant)));

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("share_grants")}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{t("share_grants_hint")}</p>
      </div>
      {grants.length === 0 ? (
        <p className="text-destructive text-xs leading-relaxed">{t("share_grants_none")}</p>
      ) : (
        <div className="space-y-3">
          {grants.map((grant) => (
            <ShareGrantCard
              key={grant.id}
              grant={grant}
              triggerKindsInWorkflow={triggerKindsInWorkflow}
              onChange={(next) => update(grant.id, next)}
              onRemove={() => onChange(grants.filter((row) => row.id !== grant.id))}
            />
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={grants.length >= MAX_GRANTS}
        onClick={() =>
          onChange([
            ...grants,
            emptyUserGrant(PUBLIC_TRIGGER_KINDS.filter((kind) => triggerKindsInWorkflow?.has(kind) ?? true)),
          ])
        }
      >
        <Plus className="size-4" />
        {t("share_grants_add")}
      </Button>
    </div>
  );
}

function ShareGrantCard({
  grant,
  onChange,
  onRemove,
  triggerKindsInWorkflow,
}: {
  grant: ShareGrant;
  onChange: (grant: ShareGrant) => void;
  onRemove: () => void;
  triggerKindsInWorkflow?: Set<PublicTriggerKind>;
}) {
  const t = useTranslations("WorkflowsPage");
  const [draft, setDraft] = useState("");
  const [emailError, setEmailError] = useState(false);

  const setAudience = (audience: ShareAudience) => {
    onChange({ ...grant, audience, emails: audience === "all" ? [] : grant.emails });
    setEmailError(false);
  };

  const addEmail = () => {
    const email = draft.trim().toLowerCase();
    if (!email) return;
    if (!isShareEmail(email)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setDraft("");
    if (grant.emails.includes(email) || grant.emails.length >= MAX_EMAILS) return;
    onChange({ ...grant, emails: [...grant.emails, email] });
  };

  const toggleKind = (kind: PublicTriggerKind) => {
    const triggerKinds = grant.triggerKinds.includes(kind)
      ? grant.triggerKinds.filter((item) => item !== kind)
      : PUBLIC_TRIGGER_KINDS.filter((item) => item === kind || grant.triggerKinds.includes(item));
    onChange({ ...grant, triggerKinds });
  };

  return (
    <div className="bg-background space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label={t("share_grants_audience")} className="grid flex-1 grid-cols-2 gap-2">
          {(["all", "users"] as const).map((audience) => {
            const selected = grant.audience === audience;
            return (
              <button
                key={audience}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                )}
                onClick={() => setAudience(audience)}
              >
                {t(`share_grants_audience_${audience}`)}
              </button>
            );
          })}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t("share_grants_remove")} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {grant.audience === "users" ? (
        <div className="space-y-2">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addEmail();
            }}
          >
            <Input
              value={draft}
              placeholder={t("share_grants_email_placeholder")}
              aria-label={t("share_grants_email_placeholder")}
              aria-invalid={emailError}
              onChange={(event) => {
                setDraft(event.target.value);
                setEmailError(false);
              }}
            />
            <Button type="submit" variant="outline" disabled={grant.emails.length >= MAX_EMAILS}>
              {t("share_grants_email_add")}
            </Button>
          </form>
          {emailError ? <p className="text-destructive text-xs">{t("share_grants_email_invalid")}</p> : null}
          {grant.emails.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("share_grants_emails_empty")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {grant.emails.map((email) => (
                <span key={email} className="bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                  {email}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={t("share_grants_email_remove", { email })}
                    onClick={() => onChange({ ...grant, emails: grant.emails.filter((item) => item !== email) })}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs leading-relaxed">{t("share_grants_audience_all_desc")}</p>
      )}

      <div role="group" aria-label={t("share_grants_triggers")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PUBLIC_TRIGGER_KINDS.map((kind) => {
          const Icon = TRIGGER_ICONS[kind];
          const checked = grant.triggerKinds.includes(kind);
          const inWorkflow = triggerKindsInWorkflow?.has(kind) ?? true;
          return (
            <button
              key={kind}
              type="button"
              role="checkbox"
              aria-checked={checked}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                checked ? "border-primary bg-primary/10" : "hover:bg-accent",
                !inWorkflow && "opacity-60",
              )}
              onClick={() => toggleKind(kind)}
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
      {grant.triggerKinds.length === 0 ? (
        <p className="text-destructive text-xs leading-relaxed">{t("share_grants_triggers_none")}</p>
      ) : null}
    </div>
  );
}
