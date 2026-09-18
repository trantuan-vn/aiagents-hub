"use client";

import NextLink from "next/link";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsSteps } from "./docs-ui";

const QuickstartPage = () => {
  const t = useTranslations("Docs");
  const steps = t.raw("quickstart.steps") as { title: string; body: string }[];

  return (
    <DocsPage
      title={t("quickstart.title")}
      description={t("quickstart.description")}
      toc={[
        { id: "steps", label: t("quickstart.toc_steps") },
        { id: "credits", label: t("quickstart.toc_credits") },
        { id: "next", label: t("quickstart.toc_next") },
      ]}
    >
      <DocsSection id="steps" title={t("quickstart.toc_steps")}>
        <DocsSteps
          steps={steps.map((step, index) => ({
            ...step,
            action:
              index === 0 ? (
                <Button asChild className="mt-4" variant="default">
                  <NextLink href="/auth/v3/login">
                    {t("quickstart.open_dashboard")}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </NextLink>
                </Button>
              ) : undefined,
          }))}
        />
      </DocsSection>

      <DocsSection id="credits" title={t("quickstart.credits_title")}>
        <DocsP>{t("quickstart.credits_body")}</DocsP>
        <DocsList items={t.raw("quickstart.credits_items") as string[]} />
      </DocsSection>

      <DocsSection id="next" title={t("quickstart.next_title")}>
        <DocsCallout variant="info" title={t("quickstart.next_callout")}>
          {t("quickstart.next_body")}{" "}
          <Link to="/docs/api" className="text-primary font-medium hover:underline">
            {t("nav.api")}
          </Link>{" "}
          {t("quickstart.next_or")}{" "}
          <Link to="/docs/plans" className="text-primary font-medium hover:underline">
            {t("nav.plans")}
          </Link>
          .
        </DocsCallout>
      </DocsSection>
    </DocsPage>
  );
};

export default QuickstartPage;
