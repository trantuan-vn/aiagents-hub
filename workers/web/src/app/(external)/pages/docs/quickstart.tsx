"use client";

import NextLink from "next/link";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import Layout from "../../components/layout/main-layout";

import { DocsShell } from "./docs-shell";

const QuickstartPage = () => {
  const t = useTranslations("Docs");

  const steps = [
    { title: t("quickstart_step1_title"), body: t("quickstart_step1_body") },
    { title: t("quickstart_step2_title"), body: t("quickstart_step2_body") },
    { title: t("quickstart_step3_title"), body: t("quickstart_step3_body") },
    { title: t("quickstart_step4_title"), body: t("quickstart_step4_body") },
  ];

  return (
    <Layout>
      <DocsShell title={t("quickstart_title")} description={t("quickstart_description")}>
        <div className="max-w-none">
          <ol className="text-foreground mb-10 list-decimal space-y-8 pl-5 text-base leading-relaxed">
            {steps.map((step, index) => (
              <li key={step.title}>
                <p className="font-semibold">{step.title}</p>
                <p className="text-muted-foreground mt-2">{step.body}</p>
                {index === 0 ? (
                  <Button asChild className="mt-4" variant="default">
                    <NextLink href="/auth/v3/login">
                      {t("quickstart_open_dashboard")}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </NextLink>
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>

          <div className="bg-muted/40 border-border rounded-xl border p-6">
            <h2 className="text-foreground mb-2 text-lg font-semibold">{t("quickstart_credits_title")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{t("quickstart_credits_body")}</p>
          </div>

          <p className="text-muted-foreground mt-8 text-sm">
            {t("quickstart_more")}{" "}
            <Link to="/docs/api" className="text-primary font-medium hover:underline">
              {t("nav_api")}
            </Link>
            .
          </p>
        </div>
      </DocsShell>
    </Layout>
  );
};

export default QuickstartPage;
