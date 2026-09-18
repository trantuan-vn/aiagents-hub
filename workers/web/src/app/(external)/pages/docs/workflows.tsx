"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

const WorkflowsPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("workflows.title")}
      description={t("workflows.description")}
      toc={[
        { id: "canvas", label: t("workflows.toc_canvas") },
        { id: "nodes", label: t("workflows.toc_nodes") },
        { id: "run", label: t("workflows.toc_run") },
        { id: "versions", label: t("workflows.toc_versions") },
      ]}
    >
      <DocsSection id="canvas" title={t("workflows.canvas_title")}>
        <DocsP>{t("workflows.canvas_body")}</DocsP>
      </DocsSection>

      <DocsSection id="nodes" title={t("workflows.nodes_title")}>
        <DocsP>{t("workflows.nodes_body")}</DocsP>
        <DocsTable
          caption={t("workflows.nodes_title")}
          headers={[t("workflows.col_family"), t("workflows.col_role")]}
          rows={t.raw("workflows.node_rows") as string[][]}
        />
        <DocsCallout variant="info" title={t("workflows.edges_title")}>
          {t("workflows.edges_body")}
        </DocsCallout>
      </DocsSection>

      <DocsSection id="run" title={t("workflows.run_title")}>
        <DocsP>{t("workflows.run_body")}</DocsP>
        <DocsList items={t.raw("workflows.run_items") as string[]} />
      </DocsSection>

      <DocsSection id="versions" title={t("workflows.versions_title")}>
        <DocsP>
          {t("workflows.versions_body")}{" "}
          <Link to="/docs/sharing" className="text-primary font-medium hover:underline">
            {t("nav.sharing")}
          </Link>
          .
        </DocsP>
      </DocsSection>
    </DocsPage>
  );
};

export default WorkflowsPage;
