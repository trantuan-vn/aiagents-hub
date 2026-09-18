"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

const PlansPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("plans.title")}
      description={t("plans.description")}
      toc={[
        { id: "catalog", label: t("plans.toc_catalog") },
        { id: "compare", label: t("plans.toc_compare") },
        { id: "billing", label: t("plans.toc_billing") },
        { id: "cancel", label: t("plans.toc_cancel") },
      ]}
    >
      <DocsSection id="catalog" title={t("plans.catalog_title")}>
        <DocsP>{t("plans.catalog_body")}</DocsP>
        <DocsTable
          caption={t("plans.catalog_title")}
          headers={[t("plans.col_plan"), t("plans.col_price"), t("plans.col_for")]}
          rows={t.raw("plans.catalog_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="compare" title={t("plans.compare_title")}>
        <DocsP>{t("plans.compare_body")}</DocsP>
        <DocsTable
          caption={t("plans.compare_title")}
          headers={t.raw("plans.compare_headers") as string[]}
          rows={t.raw("plans.compare_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="billing" title={t("plans.billing_title")}>
        <DocsP>{t("plans.billing_body")}</DocsP>
        <DocsList items={t.raw("plans.billing_items") as string[]} />
        <DocsCallout variant="tip" title={t("plans.checkout_title")}>
          {t("plans.checkout_body")}{" "}
          <Link to="/packages" className="text-primary font-medium hover:underline">
            {t("plans.checkout_link")}
          </Link>
          .
        </DocsCallout>
      </DocsSection>

      <DocsSection id="cancel" title={t("plans.cancel_title")}>
        <DocsP>{t("plans.cancel_body")}</DocsP>
      </DocsSection>
    </DocsPage>
  );
};

export default PlansPage;
