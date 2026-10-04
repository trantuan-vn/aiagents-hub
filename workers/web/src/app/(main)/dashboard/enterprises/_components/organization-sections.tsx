"use client";

import { useState } from "react";

import { Copy, Trash2, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminEnterprises,
  type AdminEnterprise,
  type AdminEnterpriseDetail,
  type AdminEnterpriseWorkflow,
} from "@/lib/enterprise-admin-api";
import { formatEnterpriseDate, formatUsd, type SeatRole } from "@/lib/enterprise-api";

import { TurnOffFlagButton } from "./turn-off-flag-button";

export type SheetAct = (fn: () => Promise<unknown>, success: string, reload?: boolean) => Promise<boolean>;

export function OrganizationSummary({ detail }: { detail: AdminEnterpriseDetail }) {
  const t = useTranslations("EnterpriseAdminPage");
  const locale = useLocale();
  const org = detail.enterprise;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(org.id);
      toast.success(t("id_copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  return (
    <>
      <div className="space-y-1">
        <Label>{t("organization_id")}</Label>
        <div className="flex items-center gap-2">
          <code className="bg-muted flex-1 truncate rounded px-2 py-1 text-xs">{org.id}</code>
          <Button size="sm" variant="outline" onClick={() => void copyId()}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t("organization_id_hint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">{t("col_period_end")}</p>
          <p>{formatEnterpriseDate(org.periodEnd, locale)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t("grace")}</p>
          <p>{formatEnterpriseDate(org.seatGraceUntil, locale)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t("interval")}</p>
          <p>{org.planInterval ? t("months", { n: org.planInterval }) : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t("col_workflows")}</p>
          <p>{t("workflow_counts", { pending: detail.workflows.pending, accepted: detail.workflows.accepted })}</p>
        </div>
      </div>
    </>
  );
}

/** Mount with `key={org.updatedAt}` so the form resets after each save. */
export function OrganizationSettings({
  org,
  busy,
  act,
  onHoldChange,
}: {
  org: AdminEnterprise;
  busy: boolean;
  act: SheetAct;
  onHoldChange: (value: boolean) => void;
}) {
  const t = useTranslations("EnterpriseAdminPage");
  const [name, setName] = useState(org.name);
  const [minProSeats, setMinProSeats] = useState(String(org.minProSeats));
  const [note, setNote] = useState(org.note ?? "");

  const minPro = Number(minProSeats);
  const valid = !!name.trim() && Number.isInteger(minPro) && minPro >= 0;
  const dirty = name.trim() !== org.name || minPro !== org.minProSeats || (note.trim() || null) !== org.note;

  const save = () =>
    void act(
      () => adminEnterprises.patch(org.id, { name: name.trim(), minProSeats: minPro, note: note.trim() || null }),
      t("saved"),
    );

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t("section_settings")}</h3>
      <div className="space-y-2">
        <Label htmlFor="org-edit-name">{t("field_name")}</Label>
        <Input id="org-edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-edit-min">{t("field_min_pro")}</Label>
        <Input
          id="org-edit-min"
          type="number"
          min={0}
          value={minProSeats}
          onChange={(e) => setMinProSeats(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t("field_min_pro_edit_hint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-edit-note">{t("field_note")}</Label>
        <Textarea id="org-edit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>
      <Button size="sm" disabled={!dirty || busy || !valid} onClick={save}>
        {t("save")}
      </Button>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <Label htmlFor="org-hold">{t("hold")}</Label>
          <p className="text-muted-foreground text-xs">{t("hold_hint")}</p>
        </div>
        <Switch id="org-hold" checked={org.adminHold} disabled={busy} onCheckedChange={onHoldChange} />
      </div>
    </div>
  );
}

export function OrganizationMembers({
  orgId,
  members,
  busy,
  act,
  onRemove,
}: {
  orgId: string;
  members: AdminEnterpriseDetail["members"];
  busy: boolean;
  act: SheetAct;
  onRemove: (userId: string) => void;
}) {
  const t = useTranslations("EnterpriseAdminPage");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SeatRole>("pro");

  const add = async () => {
    const ok = await act(
      () => adminEnterprises.addMember(orgId, { userId: email.trim(), seatRole: role }),
      t("member_added"),
    );
    if (ok) setEmail("");
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t("section_members", { count: members.length })}</h3>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1"
          type="email"
          placeholder={t("member_email_placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className="border-input bg-background rounded-md border px-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as SeatRole)}
          aria-label={t("seat_role")}
        >
          <option value="business">{t("role_business")}</option>
          <option value="pro">{t("role_pro")}</option>
        </select>
        <Button size="sm" disabled={busy || !email.trim()} onClick={() => void add()}>
          <UserPlus className="mr-1 h-4 w-4" />
          {t("add_member")}
        </Button>
      </div>
      {members.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("no_members")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{m.userId}</span>
              <span className="flex items-center gap-2">
                <Badge variant={m.seatRole === "business" ? "default" : "secondary"}>
                  {m.seatRole === "business" ? t("role_business") : t("role_pro")}
                </Badge>
                <Button size="icon" variant="ghost" aria-label={t("remove_member")} onClick={() => onRemove(m.userId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrganizationWorkflows({
  workflows,
  onChanged,
}: {
  workflows: AdminEnterpriseWorkflow[];
  onChanged: () => void;
}) {
  const t = useTranslations("EnterpriseAdminPage");
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t("section_workflows")}</h3>
      {workflows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("no_org_workflows")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {workflows.map((wf) => (
            <li
              key={`${wf.ownerId}:${wf.workflowId}`}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{wf.name}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {wf.ownerIdentifier ?? wf.ownerId} · {t(`acceptance_${wf.enterpriseAcceptance}`)}
                </span>
              </span>
              <TurnOffFlagButton ownerId={wf.ownerId} workflowId={wf.workflowId} name={wf.name} onDone={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OrganizationInvoices({ invoices }: { invoices: AdminEnterpriseDetail["invoices"] }) {
  const t = useTranslations("EnterpriseAdminPage");
  const locale = useLocale();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t("section_invoices")}</h3>
      {invoices.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("no_invoices")}</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block">
                  {t(`invoice_kind_${inv.kind}`)} · {formatUsd(inv.amount_usd)}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {inv.payer_user_id} · {formatEnterpriseDate(inv.created_at, locale)}
                  {inv.period_end ? ` → ${formatEnterpriseDate(inv.period_end, locale)}` : ""}
                </span>
              </span>
              <Badge variant={inv.status === "paid" ? "default" : "outline"}>{t(`invoice_status_${inv.status}`)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
