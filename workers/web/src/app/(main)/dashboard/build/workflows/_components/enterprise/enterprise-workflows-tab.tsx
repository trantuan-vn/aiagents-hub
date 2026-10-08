"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Building2, Copy, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/enterprise/confirm-action";
import { EnterpriseGraceBanner } from "@/components/enterprise/enterprise-grace-banner";
import { EnterpriseStatusBadge } from "@/components/enterprise/enterprise-status-badge";
import { TokenDialog, type IssuedToken } from "@/components/enterprise/token-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  memberEnterprise,
  useEnterpriseErrorMessage,
  type CatalogCard,
  type CatalogEnterprise,
  type EnterpriseCatalog,
  type EnterpriseTrigger,
} from "@/lib/enterprise-api";

import { EnterpriseGrantsSheet, type GrantsTarget } from "./enterprise-grants-sheet";
import { EnterpriseRunDialog, type RunTarget } from "./enterprise-run-dialog";
import { ProposalCard, WorkflowCard, type Decision } from "./enterprise-workflow-cards";

type PendingDecision = { card: CatalogCard; decision: Decision };

export function EnterpriseWorkflowsTab() {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const errorMessage = useEnterpriseErrorMessage();
  const [catalog, setCatalog] = useState<EnterpriseCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCatalog(await memberEnterprise.catalog());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [errorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!catalog) return loading ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null;
  if (!catalog.enterprise) return <NotMember />;
  return <OrganizationView catalog={catalog} org={catalog.enterprise} loading={loading} reload={load} />;
}

function NotMember() {
  const t = useTranslations("EnterpriseWorkflowsTab");
  return (
    <Card>
      <CardContent className="space-y-2 py-6">
        <p className="flex items-center gap-2 font-medium">
          <Building2 className="h-4 w-4" />
          {t("not_member_title")}
        </p>
        <p className="text-muted-foreground text-sm">{t("not_member_body")}</p>
        <Link href="/docs/enterprise" className="text-sm font-medium underline">
          {t("learn_more")}
        </Link>
      </CardContent>
    </Card>
  );
}

function OrganizationView({
  catalog,
  org,
  loading,
  reload,
}: {
  catalog: EnterpriseCatalog;
  org: CatalogEnterprise;
  loading: boolean;
  reload: () => Promise<void>;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const errorMessage = useEnterpriseErrorMessage();
  const [runTarget, setRunTarget] = useState<RunTarget | null>(null);
  const [grantsTarget, setGrantsTarget] = useState<GrantsTarget | null>(null);
  const [tokens, setTokens] = useState<IssuedToken[]>([]);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const isBusiness = org.seatRole === "business";

  const issueOwnCredential = async (card: CatalogCard, trigger: EnterpriseTrigger) => {
    try {
      const res = await memberEnterprise.issueCredential(card.ownerId, card.id, { triggerKey: trigger.triggerKey });
      setTokens([
        {
          token: res.token,
          label: trigger.label,
          ...(trigger.kind === "webhook" ? { bodyJson: JSON.stringify(trigger.bodyExample ?? {}) } : {}),
        },
      ]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const decide = async ({ card, decision }: PendingDecision) => {
    try {
      await memberEnterprise.decide(card.ownerId, card.id, decision);
      toast.success(t(`decision_done_${decision}`));
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const target = (card: CatalogCard) => ({ ownerId: card.ownerId, workflowId: card.id, workflowName: card.name });
  const cardKey = (card: CatalogCard) => `${card.ownerId}:${card.id}`;

  return (
    <div className="space-y-4">
      <OrganizationHeader org={org} loading={loading} onRefresh={() => void reload()} />

      {isBusiness && catalog.proposals.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("proposals_title", { count: catalog.proposals.length })}</h3>
          {catalog.proposals.map((card) => (
            <ProposalCard key={cardKey(card)} card={card} onDecide={(decision) => setPending({ card, decision })} />
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("workflows_title")}</h3>
        {catalog.workflows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {isBusiness ? t("no_workflows_business") : t("no_workflows_pro")}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {catalog.workflows.map((card) => (
              <WorkflowCard
                key={cardKey(card)}
                card={card}
                isBusiness={isBusiness}
                onRun={(trigger) => setRunTarget({ ...target(card), trigger })}
                onGrants={() => setGrantsTarget(target(card))}
                onIssueCredential={(trigger) => void issueOwnCredential(card, trigger)}
                onRelease={() => setPending({ card, decision: "release" })}
              />
            ))}
          </div>
        )}
      </section>

      <EnterpriseRunDialog target={runTarget} onClose={() => setRunTarget(null)} />
      <EnterpriseGrantsSheet target={grantsTarget} onClose={() => setGrantsTarget(null)} onTokens={setTokens} />
      <TokenDialog tokens={tokens} onClose={() => setTokens([])} />
      <DecisionConfirm pending={pending} onDismiss={() => setPending(null)} onConfirm={decide} />
    </div>
  );
}

function OrganizationHeader({
  org,
  loading,
  onRefresh,
}: {
  org: CatalogEnterprise;
  loading: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const isBusiness = org.seatRole === "business";

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(t("id_copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="font-semibold">{org.name}</span>
            <EnterpriseStatusBadge status={org.status} />
            <Badge variant="secondary">{isBusiness ? t("role_business") : t("role_pro")}</Badge>
          </div>
          {org.id ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              <span>{t("organization_id")}:</span>
              <code className="bg-muted rounded px-1.5 py-0.5">{org.id}</code>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => void copyId(org.id ?? "")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <span>{t("organization_id_hint")}</span>
            </div>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      <EnterpriseGraceBanner
        status={org.status}
        periodEnd={org.periodEnd}
        seatGraceUntil={org.seatGraceUntil}
        showBillingLink={isBusiness}
      />
      {org.status === "pending" ? <p className="text-muted-foreground text-sm">{t("org_pending")}</p> : null}
      {org.status === "active" && !org.seatActive ? (
        <p className="text-muted-foreground text-sm">{t("seat_inactive")}</p>
      ) : null}
    </>
  );
}

function DecisionConfirm({
  pending,
  onDismiss,
  onConfirm,
}: {
  pending: PendingDecision | null;
  onDismiss: () => void;
  onConfirm: (p: PendingDecision) => Promise<void>;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const decision = pending?.decision ?? "accept";
  return (
    <ConfirmAction
      open={!!pending}
      onOpenChange={(open) => (open ? undefined : onDismiss())}
      title={t(`decision_title_${decision}`, { name: pending?.card.name ?? "" })}
      description={t(`decision_body_${decision}`, { percent: pending?.card.royaltyPercent ?? 0 })}
      confirmLabel={t(decision)}
      destructive={decision !== "accept"}
      onConfirm={async () => {
        if (pending) await onConfirm(pending);
      }}
    />
  );
}
