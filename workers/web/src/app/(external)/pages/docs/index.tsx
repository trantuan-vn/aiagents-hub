"use client";

import { Building2, Coins, Layers, Share2, Sparkles, Webhook, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

import { DocsCallout, DocsLinkCard, DocsPage, DocsP, DocsSection } from "./docs-ui";

const DocsIndex = () => {
  const t = useTranslations("Docs");

  const layers = [
    { href: "/docs/plans", icon: Layers, title: t("hub.layer_plan_title"), description: t("hub.layer_plan_desc") },
    { href: "/docs/credits", icon: Coins, title: t("hub.layer_credit_title"), description: t("hub.layer_credit_desc") },
    {
      href: "/docs/enterprise",
      icon: Building2,
      title: t("hub.layer_ent_title"),
      description: t("hub.layer_ent_desc"),
    },
  ];

  const paths = [
    { href: "/docs/quickstart", icon: Zap, title: t("hub.path_start_title"), description: t("hub.path_start_desc") },
    {
      href: "/docs/workflows",
      icon: Workflow,
      title: t("hub.path_build_title"),
      description: t("hub.path_build_desc"),
    },
    { href: "/docs/api", icon: Webhook, title: t("hub.path_run_title"), description: t("hub.path_run_desc") },
    { href: "/docs/sharing", icon: Share2, title: t("hub.path_earn_title"), description: t("hub.path_earn_desc") },
  ];

  return (
    <DocsPage title={t("hub.title")} description={t("hub.description")} wide>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1 font-normal">
          <Sparkles className="h-3.5 w-3.5" />
          {t("hub.badge_1")}
        </Badge>
        <Badge variant="outline" className="font-normal">
          {t("hub.badge_2")}
        </Badge>
      </div>

      <DocsSection id="how-you-pay" title={t("hub.layers_title")}>
        <DocsP>{t("hub.layers_body")}</DocsP>
        <div className="grid gap-4 md:grid-cols-3">
          {layers.map((card) => (
            <DocsLinkCard key={card.href} {...card} />
          ))}
        </div>
      </DocsSection>

      <DocsSection id="choose-a-path" title={t("hub.paths_title")}>
        <div className="grid gap-4 sm:grid-cols-2">
          {paths.map((card) => (
            <DocsLinkCard key={card.href} {...card} />
          ))}
        </div>
      </DocsSection>

      <DocsCallout variant="tip" title={t("hub.callout_title")}>
        {t("hub.callout_body")}{" "}
        <Link to="/packages" className="text-primary font-medium hover:underline">
          {t("hub.callout_link")}
        </Link>
        .
      </DocsCallout>
    </DocsPage>
  );
};

export default DocsIndex;
