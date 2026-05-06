"use client";

import { ArrowRight, Code2, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import Layout from "../../components/layout/main-layout";

import { DocsShell } from "./docs-shell";

const DocsIndex = () => {
  const t = useTranslations("Docs");

  const cards = [
    {
      href: "/docs/quickstart",
      icon: Zap,
      titleKey: "card_quickstart_title" as const,
      descKey: "card_quickstart_desc" as const,
    },
    {
      href: "/docs/api",
      icon: Code2,
      titleKey: "card_api_title" as const,
      descKey: "card_api_desc" as const,
    },
  ];

  return (
    <Layout>
      <DocsShell title={t("hub_title")} description={t("hub_description")}>
        <div className="space-y-10">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 font-normal">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hub_badge_1")}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {t("hub_badge_2")}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cards.map((c) => (
              <Link key={c.href} to={c.href} className="group block">
                <Card className="border-border/80 hover:border-primary/40 h-full transition-all duration-200 hover:shadow-md">
                  <CardHeader className="space-y-3">
                    <div className="bg-primary/10 text-primary inline-flex h-10 w-10 items-center justify-center rounded-lg">
                      <c.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="group-hover:text-primary flex items-center gap-2 text-lg transition-colors">
                      {t(c.titleKey)}
                      <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </CardTitle>
                    <CardDescription className="text-base leading-relaxed">{t(c.descKey)}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>

          <div className="bg-muted/40 border-border rounded-xl border p-6 md:p-8">
            <h2 className="text-foreground mb-2 text-lg font-semibold">{t("hub_base_title")}</h2>
            <p className="text-muted-foreground mb-4 text-sm leading-relaxed">{t("hub_base_body")}</p>
            <code className="bg-background border-border block rounded-lg border px-4 py-3 text-sm break-all">
              https://api.aiagents-hub.vn
            </code>
          </div>
        </div>
      </DocsShell>
    </Layout>
  );
};

export default DocsIndex;
