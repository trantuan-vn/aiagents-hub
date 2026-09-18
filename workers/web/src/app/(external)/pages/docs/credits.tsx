"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

const CreditsPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("credits.title")}
      description={t("credits.description")}
      toc={[
        { id: "unit", label: t("credits.toc_unit") },
        { id: "billed", label: t("credits.toc_billed") },
        { id: "expiry", label: t("credits.toc_expiry") },
        { id: "estimate", label: t("credits.toc_estimate") },
      ]}
    >
      <DocsSection id="unit" title={t("credits.unit_title")}>
        <DocsP>{t("credits.unit_body")}</DocsP>
        <DocsCallout variant="tip" title={t("credits.unit_callout")}>
          {t("credits.unit_callout_body")}
        </DocsCallout>
      </DocsSection>

      <DocsSection id="billed" title={t("credits.billed_title")}>
        <DocsP>{t("credits.billed_body")}</DocsP>
        <DocsTable
          caption={t("credits.billed_title")}
          headers={[t("credits.col_event"), t("credits.col_charge")]}
          rows={t.raw("credits.bill_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="expiry" title={t("credits.expiry_title")}>
        <DocsP>{t("credits.expiry_body")}</DocsP>
        <DocsList items={t.raw("credits.expiry_items") as string[]} />
        <DocsP>
          {t("credits.topup_body")}{" "}
          <Link to="/docs/plans" className="text-primary font-medium hover:underline">
            {t("nav.plans")}
          </Link>
          .
        </DocsP>
      </DocsSection>

      <DocsSection id="estimate" title={t("credits.estimate_title")}>
        <DocsP>{t("credits.estimate_body")}</DocsP>
        <DocsCallout variant="info" title={t("credits.royalty_title")}>
          {t("credits.royalty_body")}{" "}
          <Link to="/docs/sharing" className="text-primary font-medium hover:underline">
            {t("nav.sharing")}
          </Link>
          .
        </DocsCallout>
      </DocsSection>
    </DocsPage>
  );
};

export default CreditsPage;
