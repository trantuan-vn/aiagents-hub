"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

const AgentsPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("agents.title")}
      description={t("agents.description")}
      toc={[
        { id: "loop", label: t("agents.toc_loop") },
        { id: "rag", label: t("agents.toc_rag") },
        { id: "memory", label: t("agents.toc_memory") },
        { id: "sku", label: t("agents.toc_sku") },
      ]}
    >
      <DocsSection id="loop" title={t("agents.loop_title")}>
        <DocsP>{t("agents.loop_body")}</DocsP>
        <DocsTable
          caption={t("agents.loop_title")}
          headers={[t("agents.col_kind"), t("agents.col_when")]}
          rows={t.raw("agents.kind_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="rag" title={t("agents.rag_title")}>
        <DocsP>{t("agents.rag_body")}</DocsP>
        <DocsList items={t.raw("agents.rag_items") as string[]} />
      </DocsSection>

      <DocsSection id="memory" title={t("agents.memory_title")}>
        <DocsP>{t("agents.memory_body")}</DocsP>
      </DocsSection>

      <DocsSection id="sku" title={t("agents.sku_title")}>
        <DocsCallout variant="tip" title={t("agents.sku_callout")}>
          {t("agents.sku_body")}{" "}
          <Link to="/docs/credits" className="text-primary font-medium hover:underline">
            {t("nav.credits")}
          </Link>
          .
        </DocsCallout>
      </DocsSection>
    </DocsPage>
  );
};

export default AgentsPage;
