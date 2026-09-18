"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

const TriggersPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("triggers.title")}
      description={t("triggers.description")}
      toc={[
        { id: "doors", label: t("triggers.toc_doors") },
        { id: "plans", label: t("triggers.toc_plans") },
        { id: "grace", label: t("triggers.toc_grace") },
      ]}
    >
      <DocsSection id="doors" title={t("triggers.doors_title")}>
        <DocsP>{t("triggers.doors_body")}</DocsP>
        <DocsTable
          caption={t("triggers.doors_title")}
          headers={[t("triggers.col_door"), t("triggers.col_use")]}
          rows={t.raw("triggers.door_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="plans" title={t("triggers.plans_title")}>
        <DocsP>
          {t("triggers.plans_body")}{" "}
          <Link to="/docs/plans" className="text-primary font-medium hover:underline">
            {t("nav.plans")}
          </Link>
          .
        </DocsP>
        <DocsList items={t.raw("triggers.plan_items") as string[]} />
      </DocsSection>

      <DocsSection id="grace" title={t("triggers.grace_title")}>
        <DocsP>{t("triggers.grace_body")}</DocsP>
        <DocsCallout variant="warn" title={t("triggers.grace_callout")}>
          {t("triggers.grace_warn")}
        </DocsCallout>
      </DocsSection>
    </DocsPage>
  );
};

export default TriggersPage;
