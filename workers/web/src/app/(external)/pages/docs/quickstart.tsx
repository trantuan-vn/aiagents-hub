"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { ENDPOINT_CODE_EXAMPLES } from "@/app/(main)/dashboard/build/ekyc/_data/code-examples";
import { Button } from "@/components/ui/button";

import Layout from "../../components/layout/main-layout";

import { DocsCodeSample } from "./docs-code-sample";
import { DocsShell } from "./docs-shell";

const QuickstartPage = () => {
  const t = useTranslations("Docs");
  const te = useTranslations("BuildEkycPage");
  const examples = ENDPOINT_CODE_EXAMPLES["recognize-document"];

  return (
    <Layout>
      <DocsShell title={t("quickstart_title")} description={t("quickstart_description")}>
        <div className="max-w-none">
          <ol className="text-foreground mb-10 list-decimal space-y-8 pl-5 text-base leading-relaxed">
            <li>
              <p className="font-semibold">{te("step1_title")}</p>
              <p className="text-muted-foreground mt-2">{te("step1_desc")}</p>
              <Button asChild className="mt-4" variant="default">
                <a href="/dashboard/control/token" target="_blank" rel="noopener noreferrer">
                  {te("get_api_key")}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </li>
            <li>
              <p className="font-semibold">{te("step2_title")}</p>
              <p className="text-muted-foreground mt-2">{te("step2_desc")}</p>
            </li>
          </ol>

          <h2 className="text-foreground mb-3 text-xl font-semibold tracking-tight">{t("quickstart_try_title")}</h2>
          <p className="text-muted-foreground mb-6 text-base">{t("quickstart_try_body")}</p>
          <DocsCodeSample examples={examples} />

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
