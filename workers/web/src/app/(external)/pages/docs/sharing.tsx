"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection } from "./docs-ui";

const SharingPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("sharing.title")}
      description={t("sharing.description")}
      toc={[
        { id: "publish", label: t("sharing.toc_publish") },
        { id: "royalty", label: t("sharing.toc_royalty") },
        { id: "minplan", label: t("sharing.toc_minplan") },
      ]}
    >
      <DocsSection id="publish" title={t("sharing.publish_title")}>
        <DocsP>{t("sharing.publish_body")}</DocsP>
        <DocsList items={t.raw("sharing.publish_items") as string[]} />
      </DocsSection>

      <DocsSection id="royalty" title={t("sharing.royalty_title")}>
        <DocsP>{t("sharing.royalty_body")}</DocsP>
        <DocsCallout variant="info" title={t("sharing.ledger_title")}>
          {t("sharing.ledger_body")}
        </DocsCallout>
      </DocsSection>

      <DocsSection id="minplan" title={t("sharing.minplan_title")}>
        <DocsP>
          {t("sharing.minplan_body")}{" "}
          <Link to="/docs/plans" className="text-primary font-medium hover:underline">
            {t("nav.plans")}
          </Link>
          .
        </DocsP>
        <DocsCallout variant="warn" title={t("sharing.minplan_callout")}>
          {t("sharing.minplan_warn")}
        </DocsCallout>
      </DocsSection>
    </DocsPage>
  );
};

export default SharingPage;
