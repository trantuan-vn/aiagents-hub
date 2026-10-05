"use client";

import { useCallback, useEffect, useState } from "react";

import { Building2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatEnterpriseDate,
  ownerEnterprise,
  useEnterpriseErrorMessage,
  type FlagRequest,
  type OwnerWorkflowEnterprise,
} from "@/lib/enterprise-api";

type Act = (fn: () => Promise<unknown>, success: string) => Promise<void>;

const truthy = (v: unknown) => v === true || v === 1;

/** §5A.3: flag request and organization proposal, loaded and saved apart from the editor's save cycle. */
export function WorkflowEnterpriseSection({ workflowId }: { workflowId: number }) {
  const t = useTranslations("WorkflowEnterpriseSection");
  const errorMessage = useEnterpriseErrorMessage();
  const [workflow, setWorkflow] = useState<OwnerWorkflowEnterprise | null>(null);
  const [request, setRequest] = useState<FlagRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, r] = await Promise.all([
        ownerEnterprise.workflow(workflowId),
        ownerEnterprise.latestRequest(workflowId),
      ]);
      setWorkflow(w.workflow);
      setRequest(r.request);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, [workflowId, errorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const act: Act = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <div className="text-muted-foreground rounded-xl border p-4 text-xs">{t("loading")}</div>;
  }
  if (!workflow) return null;

  const flagged = truthy(workflow.isEnterprise);
  const live = truthy(workflow.isShared) && workflow.status === "published";

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          {t("title")}
        </Label>
        {flagged ? <Badge>{t("badge_flagged")}</Badge> : null}
      </div>
      {flagged && !live ? (
        <Alert>
          <AlertDescription>{t("share_reminder")}</AlertDescription>
        </Alert>
      ) : null}
      {flagged ? (
        <ProposalPanel workflow={workflow} busy={busy} act={act} />
      ) : (
        <FlagRequestPanel workflowId={workflowId} request={request} busy={busy} act={act} />
      )}
    </div>
  );
}

function FlagRequestPanel({
  workflowId,
  request,
  busy,
  act,
}: {
  workflowId: number;
  request: FlagRequest | null;
  busy: boolean;
  act: Act;
}) {
  const t = useTranslations("WorkflowEnterpriseSection");
  const locale = useLocale();
  const [note, setNote] = useState("");

  if (request?.status === "pending") {
    return (
      <div className="space-y-2">
        <p className="text-sm">{t("request_pending", { date: formatEnterpriseDate(request.createdAt, locale) })}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void act(() => ownerEnterprise.withdrawFlag(workflowId), t("withdrawn"))}
        >
          {t("withdraw_request")}
        </Button>
      </div>
    );
  }

  const submit = async () => {
    await act(() => ownerEnterprise.requestFlag(workflowId, note.trim() || undefined), t("requested"));
    setNote("");
  };

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{t("intro")}</p>
      {request?.status === "rejected" ? (
        <Alert variant="destructive">
          <AlertDescription>{t("request_rejected", { reason: request.reason ?? "—" })}</AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("note_placeholder")}
        rows={2}
        maxLength={1000}
      />
      <Button size="sm" disabled={busy} onClick={() => void submit()}>
        {t("request_flag")}
      </Button>
    </div>
  );
}

function ProposalPanel({ workflow, busy, act }: { workflow: OwnerWorkflowEnterprise; busy: boolean; act: Act }) {
  const t = useTranslations("WorkflowEnterpriseSection");
  const [enterpriseId, setEnterpriseId] = useState("");
  const acceptance = workflow.enterpriseAcceptance ?? "none";
  const royalty = workflow.acceptedRoyaltyPercent;
  const orgId = workflow.enterpriseId ?? "—";

  const propose = async () => {
    await act(() => ownerEnterprise.propose(workflow.id, enterpriseId.trim()), t("proposed"));
    setEnterpriseId("");
  };

  return (
    <>
      {acceptance === "none" ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">{t("propose_hint")}</p>
          <Input
            value={enterpriseId}
            onChange={(e) => setEnterpriseId(e.target.value)}
            placeholder={t("organization_id_placeholder")}
          />
          <Button size="sm" disabled={busy || !enterpriseId.trim()} onClick={() => void propose()}>
            {t("propose")}
          </Button>
        </div>
      ) : null}
      {acceptance === "pending" ? (
        <div className="space-y-2">
          <p className="text-sm">{t("proposal_pending", { id: orgId })}</p>
          {royalty == null ? null : (
            <p className="text-muted-foreground text-xs">{t("royalty_offered", { percent: royalty })}</p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act(() => ownerEnterprise.propose(workflow.id, null), t("proposal_withdrawn"))}
          >
            {t("withdraw_proposal")}
          </Button>
        </div>
      ) : null}
      {acceptance === "accepted" ? (
        <div className="space-y-1">
          <p className="text-sm">{t("accepted", { id: orgId })}</p>
          {royalty == null ? null : (
            <p className="text-muted-foreground text-xs">{t("royalty_frozen", { percent: royalty })}</p>
          )}
          <p className="text-muted-foreground text-xs">{t("accepted_hint")}</p>
        </div>
      ) : null}
    </>
  );
}
