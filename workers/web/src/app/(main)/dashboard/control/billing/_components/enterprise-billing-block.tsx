"use client";

import { useCallback, useEffect, useState } from "react";

import { Building2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/enterprise/confirm-action";
import { EnterpriseGraceBanner } from "@/components/enterprise/enterprise-grace-banner";
import { EnterpriseStatusBadge } from "@/components/enterprise/enterprise-status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EnterpriseApiError,
  enterpriseBilling,
  formatEnterpriseDate,
  useEnterpriseErrorMessage,
  type EnterpriseBillingSnapshot,
  type EnterpriseCheckout,
  type PlanInterval,
} from "@/lib/enterprise-api";

import { EnterprisePendingInvoice, EnterprisePeriodCheckout, EnterpriseSeatsTable } from "./enterprise-billing-parts";

/** Full reload so the order list picks up the new order before the payment dialog opens. */
function goToCheckout(path: string) {
  window.location.assign(path);
}

/** §5A.7: renders nothing unless the viewer holds a Business seat (403/404 from the snapshot). */
export function EnterpriseBillingBlock() {
  const t = useTranslations("EnterpriseBilling");
  const locale = useLocale();
  const errorMessage = useEnterpriseErrorMessage();
  const [snap, setSnap] = useState<EnterpriseBillingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    try {
      setSnap(await enterpriseBilling.snapshot());
    } catch (err) {
      setSnap(null);
      if (err instanceof EnterpriseApiError && (err.status === 403 || err.status === 404)) return;
      toast.error(errorMessage(err));
    }
  }, [errorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!snap) return null;

  const { enterprise: org, pendingInvoice } = snap;

  const startCheckout = async (fn: () => Promise<EnterpriseCheckout>) => {
    setBusy(true);
    try {
      goToCheckout((await fn()).checkoutPath);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  const cancelInvoice = async () => {
    if (!pendingInvoice) return;
    try {
      await enterpriseBilling.cancel(pendingInvoice.id);
      toast.success(t("cancelled"));
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t("title", { name: org.name })}
          <EnterpriseStatusBadge status={org.status} adminHold={org.adminHold} />
        </CardTitle>
        <CardDescription>
          {t("period", { periodEnd: formatEnterpriseDate(org.periodEnd, locale), interval: org.planInterval ?? "—" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <EnterpriseGraceBanner status={org.status} periodEnd={org.periodEnd} seatGraceUntil={org.seatGraceUntil} />

        <EnterpriseSeatsTable
          seats={snap.seats}
          periodEnd={org.periodEnd}
          disabled={busy || !!pendingInvoice}
          onAddSeat={(userId) => void startCheckout(() => enterpriseBilling.addSeat(userId))}
        />

        <ThresholdLine snap={snap} />

        {pendingInvoice ? (
          <EnterprisePendingInvoice
            invoice={pendingInvoice}
            busy={busy}
            onContinue={(orderId) => goToCheckout(`/dashboard/control/billing?payOrder=${orderId}`)}
            onCancel={() => setConfirmCancel(true)}
          />
        ) : null}

        <EnterprisePeriodCheckout
          quotes={snap.quotes}
          canPay={snap.thresholdMet && !busy}
          hasPending={!!pendingInvoice}
          onCheckout={(interval: PlanInterval) => void startCheckout(() => enterpriseBilling.checkout(interval))}
        />
      </CardContent>

      <ConfirmAction
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t("cancel_title")}
        description={t("cancel_body")}
        confirmLabel={t("cancel_invoice")}
        destructive
        onConfirm={cancelInvoice}
      />
    </Card>
  );
}

function ThresholdLine({ snap }: { snap: EnterpriseBillingSnapshot }) {
  const t = useTranslations("EnterpriseBilling");
  const minPro = snap.enterprise.minProSeats;
  return (
    <p className="text-sm">
      {t("billable", { business: snap.billableBusiness, pro: snap.billablePro, minPro })}
      {snap.thresholdMet ? null : (
        <span className="text-destructive">
          {" "}
          {t("threshold_missing", {
            business: Math.max(0, 1 - snap.billableBusiness),
            pro: Math.max(0, minPro - snap.billablePro),
          })}
        </span>
      )}
    </p>
  );
}
