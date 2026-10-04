"use client";

import { useCallback, useEffect, useState } from "react";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/enterprise/confirm-action";
import { EnterpriseStatusBadge } from "@/components/enterprise/enterprise-status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  adminEnterprises,
  adminFlags,
  type AdminEnterprise,
  type AdminEnterpriseDetail,
  type AdminEnterpriseWorkflow,
} from "@/lib/enterprise-admin-api";
import { useEnterpriseErrorMessage } from "@/lib/enterprise-api";

import {
  OrganizationInvoices,
  OrganizationMembers,
  OrganizationSettings,
  OrganizationSummary,
  OrganizationWorkflows,
  type SheetAct,
} from "./organization-sections";

type Props = {
  enterpriseId: string | null;
  onClose: () => void;
  onChanged: () => void;
};

type Pending = { kind: "hold"; value: boolean } | { kind: "remove-member"; userId: string } | { kind: "delete" } | null;

export function OrganizationSheet({ enterpriseId, onClose, onChanged }: Props) {
  const t = useTranslations("EnterpriseAdminPage");
  const errorMessage = useEnterpriseErrorMessage();
  const [detail, setDetail] = useState<AdminEnterpriseDetail | null>(null);
  const [workflows, setWorkflows] = useState<AdminEnterpriseWorkflow[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    try {
      const [d, w] = await Promise.all([adminEnterprises.get(enterpriseId), adminFlags.workflows()]);
      setDetail(d);
      setWorkflows(w.workflows.filter((wf) => wf.enterpriseId === enterpriseId));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [enterpriseId, errorMessage]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  const changed = () => {
    void load();
    onChanged();
  };

  const act: SheetAct = async (fn, success, reload = true) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      if (reload) changed();
      else onChanged();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const org = detail?.enterprise;

  return (
    <Sheet open={!!enterpriseId} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {org?.name ?? t("loading")}
            {org ? <EnterpriseStatusBadge status={org.status} adminHold={org.adminHold} /> : null}
          </SheetTitle>
          <SheetDescription>{t("sheet_description")}</SheetDescription>
        </SheetHeader>

        {org && detail ? (
          <div className="mt-6 space-y-6 px-1 pb-8">
            <OrganizationSummary detail={detail} />
            <Separator />
            <OrganizationSettings
              key={org.updatedAt}
              org={org}
              busy={busy}
              act={act}
              onHoldChange={(value) => setPending({ kind: "hold", value })}
            />
            <Separator />
            <OrganizationMembers
              orgId={org.id}
              members={detail.members}
              busy={busy}
              act={act}
              onRemove={(userId) => setPending({ kind: "remove-member", userId })}
            />
            <Separator />
            <OrganizationWorkflows workflows={workflows} onChanged={changed} />
            <Separator />
            <OrganizationInvoices invoices={detail.invoices} />
            <Separator />
            <Button variant="destructive" size="sm" onClick={() => setPending({ kind: "delete" })}>
              <Trash2 className="mr-1 h-4 w-4" />
              {t("delete_organization")}
            </Button>
          </div>
        ) : null}

        {org ? (
          <OrganizationConfirms
            org={org}
            pending={pending}
            onDismiss={() => setPending(null)}
            act={act}
            onDeleted={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OrganizationConfirms({
  org,
  pending,
  onDismiss,
  act,
  onDeleted,
}: {
  org: AdminEnterprise;
  pending: Pending;
  onDismiss: () => void;
  act: SheetAct;
  onDeleted: () => void;
}) {
  const t = useTranslations("EnterpriseAdminPage");
  const dismiss = (open: boolean) => (open ? undefined : onDismiss());
  const holdOn = pending?.kind === "hold" && pending.value;

  return (
    <>
      <ConfirmAction
        open={pending?.kind === "hold"}
        onOpenChange={dismiss}
        title={holdOn ? t("hold_on_title") : t("hold_off_title")}
        description={holdOn ? t("hold_on_body") : t("hold_off_body")}
        confirmLabel={t("confirm")}
        destructive={holdOn}
        onConfirm={async () => {
          if (pending?.kind !== "hold") return;
          await act(() => adminEnterprises.patch(org.id, { adminHold: pending.value }), t("saved"));
        }}
      />
      <ConfirmAction
        open={pending?.kind === "remove-member"}
        onOpenChange={dismiss}
        title={t("remove_member_title", { email: pending?.kind === "remove-member" ? pending.userId : "" })}
        description={t("remove_member_body")}
        confirmLabel={t("remove_member")}
        destructive
        onConfirm={async () => {
          if (pending?.kind !== "remove-member") return;
          await act(() => adminEnterprises.removeMember(org.id, pending.userId), t("member_removed"));
        }}
      />
      <ConfirmAction
        open={pending?.kind === "delete"}
        onOpenChange={dismiss}
        title={t("delete_title", { name: org.name })}
        description={t("delete_body")}
        confirmLabel={t("delete_organization")}
        destructive
        onConfirm={async () => {
          const ok = await act(() => adminEnterprises.remove(org.id), t("deleted"), false);
          if (ok) onDeleted();
        }}
      />
    </>
  );
}
