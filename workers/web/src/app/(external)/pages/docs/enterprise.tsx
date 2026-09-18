"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection } from "./docs-ui";

const EnterprisePage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("enterprise.title")}
      description={t("enterprise.description")}
      toc={[
        { id: "what", label: t("enterprise.toc_what") },
        { id: "not", label: t("enterprise.toc_not") },
        { id: "contact", label: t("enterprise.toc_contact") },
      ]}
    >
      <DocsSection id="what" title={t("enterprise.what_title")}>
        <DocsP>{t("enterprise.what_body")}</DocsP>
        <DocsList items={t.raw("enterprise.what_items") as string[]} />
      </DocsSection>

      <DocsSection id="not" title={t("enterprise.not_title")}>
        <DocsCallout variant="warn" title={t("enterprise.not_callout")}>
          {t("enterprise.not_body")}{" "}
          <Link to="/docs/plans" className="text-primary font-medium hover:underline">
            {t("nav.plans")}
          </Link>
          .
        </DocsCallout>
        <DocsP>{t("enterprise.byok_body")}</DocsP>
      </DocsSection>

      <DocsSection id="contact" title={t("enterprise.contact_title")}>
        <DocsP>{t("enterprise.contact_body")}</DocsP>
        <Button asChild className="mt-2">
          <Link to="/contact">{t("enterprise.contact_cta")}</Link>
        </Button>
      </DocsSection>
    </DocsPage>
  );
};

export default EnterprisePage;
