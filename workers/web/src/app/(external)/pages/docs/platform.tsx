"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

const PlatformPage = () => {
  const t = useTranslations("Docs");

  return (
    <DocsPage
      title={t("platform.title")}
      description={t("platform.description")}
      toc={[
        { id: "principle", label: t("platform.toc_principle") },
        { id: "layers", label: t("platform.toc_layers") },
        { id: "see", label: t("platform.toc_see") },
        { id: "scale", label: t("platform.toc_scale") },
      ]}
    >
      <DocsSection id="principle" title={t("platform.principle_title")}>
        <DocsP>{t("platform.principle_body")}</DocsP>
        <DocsCallout variant="tip" title={t("platform.slogan")}>
          {t("platform.slogan_body")}
        </DocsCallout>
      </DocsSection>

      <DocsSection id="layers" title={t("platform.layers_title")}>
        <DocsP>{t("platform.layers_body")}</DocsP>
        <DocsTable
          caption={t("platform.layers_title")}
          headers={[t("platform.col_layer"), t("platform.col_buy"), t("platform.col_not")]}
          rows={t.raw("platform.layer_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="see" title={t("platform.see_title")}>
        <DocsP>{t("platform.see_body")}</DocsP>
        <DocsList items={t.raw("platform.see_items") as string[]} />
        <DocsCallout variant="warn" title={t("platform.hide_title")}>
          {t("platform.hide_body")}
        </DocsCallout>
      </DocsSection>

      <DocsSection id="scale" title={t("platform.scale_title")}>
        <DocsP>
          {t("platform.scale_body")}{" "}
          <Link to="/docs/credits" className="text-primary font-medium hover:underline">
            {t("nav.credits")}
          </Link>{" "}
          {t("platform.scale_and")}{" "}
          <Link to="/docs/plans" className="text-primary font-medium hover:underline">
            {t("nav.plans")}
          </Link>
          .
        </DocsP>
      </DocsSection>
    </DocsPage>
  );
};

export default PlatformPage;
