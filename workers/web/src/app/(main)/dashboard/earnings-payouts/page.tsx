"use client";

import { Button } from "@/components/ui/button";

import { useRequireAdmin } from "../_hooks/use-require-admin";

import { EarningsPayoutQrDialog } from "./_components/earnings-payout-qr-dialog";
import { PayoutListCard } from "./_components/payout-list-card";
import { useEarningsPayoutsPage } from "./_components/use-earnings-payouts-page";

export default function EarningsPayoutsPage() {
  const isAdmin = useRequireAdmin();
  const { t, items, accruingItems, isLoading, tableLabels, accruingTableLabels, accruingTitle, fetchList, openQr, qr } =
    useEarningsPayoutsPage(isAdmin);

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("page_title")}</h1>
          <p className="text-muted-foreground">{t("page_description")}</p>
        </div>
        <Button variant="outline" onClick={() => void fetchList()} disabled={isLoading}>
          {t("refresh")}
        </Button>
      </div>

      <PayoutListCard
        title={t("table_title")}
        isLoading={isLoading}
        loadingLabel={t("loading")}
        emptyLabel={t("no_items")}
        items={items}
        labels={tableLabels}
        onShowQr={(item) => void openQr(item)}
      />

      <PayoutListCard
        title={accruingTitle}
        description={t("accruing_table_description")}
        isLoading={isLoading}
        loadingLabel={t("loading")}
        emptyLabel={t("no_accruing_items")}
        items={accruingItems}
        labels={accruingTableLabels}
        variant="accruing"
        minHeight="compact"
      />

      <EarningsPayoutQrDialog
        open={qr.open}
        onOpenChange={qr.setOpen}
        selectedItem={qr.selectedItem}
        qrLoading={qr.loading}
        qrError={qr.error}
        qrSrc={qr.src}
        title={t("qr_dialog_title")}
        hint={t("qr_hint")}
        cancelLabel={t("cancel")}
        paidLabel={t("confirm_paid")}
        onPaid={qr.onPaid}
      />
    </div>
  );
}
