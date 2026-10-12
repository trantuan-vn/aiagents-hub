"use client";

import { useState } from "react";

import { Check, ClipboardList, Loader2, Mail, MessageSquare, MousePointerClick, Plus, Trash2, Webhook, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { sendWorkflowShareInvites, WorkflowApiError } from "../../_lib/api";
import { PUBLIC_TRIGGER_KINDS, type PublicTriggerKind } from "../../_lib/public-trigger-kinds";
import { emptyUserGrant, isShareEmail, type ShareAudience, type ShareGrant } from "../../_lib/share-grants";

const MAX_GRANTS = 20;
const MAX_EMAILS = 30;

const INVITE_ERROR_KEYS = {
  SHARE_INVITE_UNSAVED: "share_invite_error_unsaved",
  SHARE_INVITE_NOT_LIVE: "share_invite_error_not_live",
  SHARE_INVITE_NO_TRIGGERS: "share_invite_error_no_triggers",
  SHARE_INVITE_RATE: "share_invite_error_rate",
  SHARE_INVITE_FAILED: "share_invite_error_failed",
  SHARE_INVITE_EMPTY: "share_invite_error_generic",
} as const;

function ShareInviteButton({
  emails,
  workflowId,
  canSend,
}: {
  emails: string[];
  workflowId?: number;
  canSend: boolean;
}) {
  const t = useTranslations("WorkflowsPage");
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const saved = typeof workflowId === "number" && workflowId > 0;
  const language = locale.toLowerCase().startsWith("en") ? "en" : "vi";

  const send = async () => {
    if (workflowId == null || workflowId <= 0 || !canSend || sending) return;
    setSending(true);
    try {
      const result = await sendWorkflowShareInvites(workflowId, emails, language);
      if (result.sent === 0) {
        toast.message(t("share_invite_skipped", { count: result.skipped.length || emails.length }));
        return;
      }
      const parts = [t("share_invite_done", { sent: result.sent })];
      if (result.firstTime > 0) parts.push(t("share_invite_first_time", { count: result.firstTime }));
      if (result.skipped.length > 0) parts.push(t("share_invite_skipped", { count: result.skipped.length }));
      toast.success(parts.join(" "));
    } catch (err) {
      const code = err instanceof WorkflowApiError ? err.code : undefined;
      const key = code && code in INVITE_ERROR_KEYS ? INVITE_ERROR_KEYS[code as keyof typeof INVITE_ERROR_KEYS] : undefined;
      toast.error(key ? t(key) : t("share_invite_error_generic"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" className="w-full" disabled={!saved || !canSend || sending} onClick={() => void send()}>
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
        {sending ? t("share_invite_sending") : t("share_invite_send")}
      </Button>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {!saved ? t("share_invite_need_save") : canSend ? t("share_invite_hint") : t("share_grants_triggers_none")}
      </p>
    </div>
  );
}

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
  workflowId,
}: {
  grants: ShareGrant[];
  onChange: (grants: ShareGrant[]) => void;
  triggerKindsInWorkflow?: Set<PublicTriggerKind>;
  workflowId?: number;
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
              workflowId={workflowId}
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
  workflowId,
}: {
  grant: ShareGrant;
  onChange: (grant: ShareGrant) => void;
  onRemove: () => void;
  triggerKindsInWorkflow?: Set<PublicTriggerKind>;
  workflowId?: number;
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
          {grant.emails.length > 0 ? (
            <ShareInviteButton emails={grant.emails} workflowId={workflowId} canSend={grant.triggerKinds.length > 0} />
          ) : null}
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
