"use client";

import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { DocsCodeSample } from "./docs-code-sample";
import { DocsCallout, DocsList, DocsPage, DocsP, DocsSection, DocsTable } from "./docs-ui";

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
    <DocsPage
      title={t("api.title")}
      description={t("api.description")}
      toc={[
        { id: "auth", label: t("api.toc_auth") },
        { id: "run", label: t("api.toc_run") },
        { id: "errors", label: t("api.toc_errors") },
        { id: "credits", label: t("api.toc_credits") },
      ]}
    >
      <DocsSection id="auth" title={t("api.auth_title")}>
        <DocsP>{t("api.auth_body")}</DocsP>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              {t("api.base_url_label")}
            </p>
            <code className="bg-muted/40 border-border text-foreground block rounded-lg border px-3 py-2 break-all">
              https://api.aiagents-hub.vn
            </code>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              {t("api.auth_header")}
            </p>
            <code className="bg-muted/40 border-border text-foreground block rounded-lg border px-3 py-2 break-all">
              Authorization: Bearer YOUR_API_KEY
            </code>
          </div>
        </div>
      </DocsSection>

      <DocsSection id="run" title={t("api.webhook_title")}>
        <DocsP>{t("api.webhook_body")}</DocsP>
        <DocsList items={t.raw("api.param_items") as string[]} />
        <DocsCodeSample examples={WEBHOOK_EXAMPLES} />
        <DocsP className="text-sm">
          {t("api.trigger_note")}{" "}
          <Link to="/docs/triggers" className="text-primary font-medium hover:underline">
            {t("nav.triggers")}
          </Link>
          .
        </DocsP>
      </DocsSection>

      <DocsSection id="errors" title={t("api.errors_title")}>
        <DocsP>{t("api.errors_body")}</DocsP>
        <DocsTable
          caption={t("api.errors_title")}
          headers={[t("api.col_code"), t("api.col_when")]}
          rows={t.raw("api.error_rows") as string[][]}
        />
      </DocsSection>

      <DocsSection id="credits" title={t("api.credits_title")}>
        <DocsCallout variant="info" title={t("api.credits_callout")}>
          {t("api.credits_body")}
        </DocsCallout>
      </DocsSection>
    </DocsPage>
  );
};

export default ApiReferencePage;
