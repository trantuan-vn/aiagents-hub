"use client";

import { useTranslations } from "next-intl";

import { ENDPOINTS, ENDPOINT_CODE_EXAMPLES } from "@/app/(main)/dashboard/build/ekyc/_data/code-examples";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import Layout from "../../components/layout/main-layout";

import { DocsCodeSample } from "./docs-code-sample";
import { DocsShell } from "./docs-shell";

const ApiReferencePage = () => {
  const t = useTranslations("Docs");
  const te = useTranslations("BuildEkycPage");

  return (
    <Layout>
      <DocsShell title={t("api_page_title")} description={t("api_page_description")}>
        <div className="space-y-12">
          <section className="bg-muted/40 border-border rounded-xl border p-6 md:p-8">
            <h2 className="text-foreground mb-2 text-lg font-semibold">{te("base_url_title")}</h2>
            <p className="text-muted-foreground mb-4 text-sm">{te("auth_note")}</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  {te("base_url_label")}
                </p>
                <code className="bg-background border-border block rounded-lg border px-3 py-2 break-all">
                  https://api.unitoken.trade
                </code>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  {te("auth_header")}
                </p>
                <code className="bg-background border-border block rounded-lg border px-3 py-2 break-all">
                  Authorization: Bearer YOUR_API_KEY
                </code>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-foreground mb-2 text-xl font-semibold">{te("api_reference_title")}</h2>
            <p className="text-muted-foreground mb-8 text-base">{te("api_reference_description")}</p>

            <div className="space-y-16">
              {ENDPOINTS.map((endpoint) => {
                const examples = ENDPOINT_CODE_EXAMPLES[endpoint.id];
                return (
                  <article key={endpoint.id} id={endpoint.id} className="scroll-mt-28">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Badge className="font-mono text-xs">{endpoint.method}</Badge>
                      <code className="text-foreground text-sm font-medium">{endpoint.path}</code>
                    </div>
                    <h3 className="text-foreground mb-2 text-lg font-semibold">{te(endpoint.titleKey)}</h3>
                    <p className="text-muted-foreground mb-4 max-w-3xl text-base leading-relaxed">
                      {te(endpoint.descKey)}
                    </p>
                    <div className="mb-4">
                      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                        {t("params_label")}
                      </p>
                      <ul className="text-foreground list-inside list-disc text-sm">
                        {endpoint.params.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                    <Separator className="my-6" />
                    <p className="text-muted-foreground mb-3 text-sm font-medium">{te("example_code")}</p>
                    <DocsCodeSample key={endpoint.id} examples={examples} />
                  </article>
                );
              })}
            </div>
          </section>

          <section className="bg-muted/30 border-border rounded-xl border p-6">
            <h2 className="text-foreground mb-2 text-lg font-semibold">{te("response_title")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{te("response_description")}</p>
          </section>
        </div>
      </DocsShell>
    </Layout>
  );
};

export default ApiReferencePage;
