"use client";

import { useState } from "react";

import Link from "next/link";

import { ChevronRight, Code2, FileText, Key, ShieldCheck, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CodeBlock } from "./_components/code-block";
import { ENDPOINT_CODE_EXAMPLES, ENDPOINTS, getResponseExample } from "./_data/code-examples";

const LANG_TABS = ["curl", "javascript", "python", "go", "php", "java", "csharp"] as const;

type LangTab = (typeof LANG_TABS)[number];

function pickExampleForLang(
  examples: Record<string, (apiKey: string) => string>,
  lang: LangTab,
): (apiKey: string) => string {
  switch (lang) {
    case "curl":
      return examples.curl;
    case "javascript":
      return examples.javascript;
    case "python":
      return examples.python;
    case "go":
      return examples.go;
    case "php":
      return examples.php;
    case "java":
      return examples.java;
    case "csharp":
      return examples.csharp;
  }
}

export default function BuildEkycPage() {
  const t = useTranslations("BuildEkycPage");
  const [apiKeyPlaceholder] = useState("utk_your_api_key_here");

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* Hero */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            Build
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("hero_title")}</h1>
        <p className="text-muted-foreground max-w-2xl text-lg">{t("hero_description")}</p>
      </div>

      {/* Quick start */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <CardTitle>{t("quick_start_title")}</CardTitle>
          </div>
          <CardDescription>{t("quick_start_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <Key className="text-muted-foreground h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{t("step1_title")}</p>
              <p className="text-muted-foreground text-sm">{t("step1_desc")}</p>
            </div>
            <Button variant="outline" size="sm" asChild className="sm:ml-auto">
              <Link href="/dashboard/control/token">
                {t("get_api_key")} <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <Code2 className="text-muted-foreground h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">{t("step2_title")}</p>
              <p className="text-muted-foreground text-sm">{t("step2_desc")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Reference – each endpoint with its code examples */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="text-primary h-5 w-5" />
            <CardTitle>{t("api_reference_title")}</CardTitle>
          </div>
          <CardDescription>{t("api_reference_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {ENDPOINTS.map((ep, idx) => {
              const examples = ENDPOINT_CODE_EXAMPLES[ep.id];
              const responseExample = getResponseExample(ep.id);
              return (
                <div
                  key={ep.path}
                  className="group bg-card hover:bg-muted/20 relative rounded-xl border transition-colors"
                >
                  {/* Endpoint header */}
                  <div className="flex flex-col gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 font-mono text-xs text-emerald-600 dark:text-emerald-400"
                      >
                        {ep.method}
                      </Badge>
                      <code className="text-muted-foreground font-mono text-sm">{ep.path}</code>
                      <span className="text-muted-foreground hidden text-xs sm:inline">
                        #{String(idx + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold">{t(ep.titleKey)}</h3>
                      <p className="text-muted-foreground mt-1 text-sm">{t(ep.descKey)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ep.params.map((p) => (
                        <Badge key={p} variant="secondary" className="font-mono text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Code examples per endpoint */}
                  <div className="bg-muted/30 border-t px-4 pt-3 pb-4 sm:px-5">
                    <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                      {t("example_code")}
                    </p>
                    <Tabs defaultValue="curl" className="w-full">
                      <TabsList className="mb-3 flex h-auto flex-wrap gap-1 p-1">
                        {LANG_TABS.map((lang) => (
                          <TabsTrigger key={lang} value={lang} className="text-xs">
                            {lang === "csharp" ? "C#" : lang.charAt(0).toUpperCase() + lang.slice(1)}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {LANG_TABS.map((lang) => {
                        const fn = pickExampleForLang(examples, lang);
                        return (
                          <TabsContent key={lang} value={lang} className="mt-0">
                            <CodeBlock code={fn(apiKeyPlaceholder)} language={lang} />
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </div>

                  {/* Response format per endpoint */}
                  {responseExample ? (
                    <div className="border-t px-4 pt-3 pb-4 sm:px-5">
                      <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                        {t("response_title")}
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 dark:bg-zinc-900">
                        <pre className="font-mono text-sm text-zinc-100">
                          <code>{responseExample}</code>
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
