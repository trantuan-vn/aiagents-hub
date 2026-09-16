"use client";

import { useTranslations } from "next-intl";

import Layout from "../../components/layout/main-layout";

import { DocsCodeSample } from "./docs-code-sample";
import { DocsShell } from "./docs-shell";

const WEBHOOK_EXAMPLES = {
  curl: (apiKey: string) => `curl -X POST "https://api.aiagents-hub.vn/hooks/workflows/YOUR_WORKFLOW_ID/run" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Summarize today's support tickets"}'`,
  javascript: (apiKey: string) => `const res = await fetch(
  "https://api.aiagents-hub.vn/hooks/workflows/YOUR_WORKFLOW_ID/run",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer ${apiKey}",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "Summarize today's support tickets" }),
  },
);
const data = await res.json();`,
  python: (apiKey: string) => `import requests

r = requests.post(
    "https://api.aiagents-hub.vn/hooks/workflows/YOUR_WORKFLOW_ID/run",
    headers={"Authorization": f"Bearer ${apiKey}"},
    json={"message": "Summarize today's support tickets"},
)
print(r.json())`,
};

const ApiReferencePage = () => {
  const t = useTranslations("Docs");

  return (
    <Layout>
      <DocsShell title={t("api_page_title")} description={t("api_page_description")}>
        <div className="space-y-12">
          <section className="bg-muted/40 border-border rounded-xl border p-6 md:p-8">
            <h2 className="text-foreground mb-2 text-lg font-semibold">{t("api_auth_title")}</h2>
            <p className="text-muted-foreground mb-4 text-sm">{t("api_auth_body")}</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  {t("api_base_url_label")}
                </p>
                <code className="bg-background border-border block rounded-lg border px-3 py-2 break-all">
                  https://api.aiagents-hub.vn
                </code>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  {t("api_auth_header")}
                </p>
                <code className="bg-background border-border block rounded-lg border px-3 py-2 break-all">
                  Authorization: Bearer YOUR_API_KEY
                </code>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-foreground mb-2 text-xl font-semibold">{t("api_webhook_title")}</h2>
            <p className="text-muted-foreground mb-6 text-base leading-relaxed">{t("api_webhook_body")}</p>
            <div className="mb-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {t("params_label")}
              </p>
              <ul className="text-foreground list-inside list-disc space-y-1 text-sm">
                <li>
                  <code>workflowId</code> — {t("api_param_workflow")}
                </li>
                <li>
                  <code>path</code> — {t("api_param_path")}
                </li>
                <li>
                  JSON body — {t("api_param_body")}
                </li>
              </ul>
            </div>
            <DocsCodeSample examples={WEBHOOK_EXAMPLES} />
          </section>

          <section className="bg-muted/30 border-border rounded-xl border p-6">
            <h2 className="text-foreground mb-2 text-lg font-semibold">{t("api_credits_title")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{t("api_credits_body")}</p>
          </section>
        </div>
      </DocsShell>
    </Layout>
  );
};

export default ApiReferencePage;
