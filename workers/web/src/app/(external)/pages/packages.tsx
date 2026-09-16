"use client";

import NextLink from "next/link";

import { Check, Coins, Shield, Sparkles, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import Layout from "../components/layout/main-layout";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const Packages = () => {
  const t = useTranslations("Packages");
  const tp = useTranslations("PackagesPage");

  const plans = [
    {
      name: t("free"),
      description: t("free_desc"),
      price: "$0",
      period: t("per_month"),
      features: [
        t("features.included_credits", { count: "200" }),
        t("features.platform_access"),
        t("features.community_support"),
        t("features.standard_quotas"),
        t("features.credits_expire"),
      ],
      cta: t("start_free"),
      href: "/auth/v3/login",
      variant: "outline" as const,
      popular: false,
      external: true,
    },
    {
      name: t("pro"),
      description: t("pro_desc"),
      price: "$49",
      period: t("per_month"),
      features: [
        t("features.included_credits", { count: "5,000" }),
        t("features.buy_credits"),
        t("features.priority_support"),
        t("features.higher_quotas"),
        t("features.webhooks"),
        t("features.sharing"),
      ],
      cta: t("get_started"),
      href: "/auth/v3/login",
      variant: "gradient" as const,
      popular: true,
      external: true,
    },
    {
      name: t("enterprise"),
      description: t("enterprise_desc"),
      price: t("custom_price"),
      period: "",
      features: [
        t("features.committed_credits"),
        t("features.sla_guarantee"),
        t("features.dedicated_support"),
        t("features.custom_quotas"),
        t("features.model_family_visibility"),
        t("features.sso_audit"),
      ],
      cta: t("contact_sales"),
      href: "/contact",
      variant: "outline" as const,
      popular: false,
      external: false,
    },
  ];

  const layers = [
    { icon: Workflow, title: tp("layers.subscription.title"), body: tp("layers.subscription.body") },
    { icon: Coins, title: tp("layers.credit.title"), body: tp("layers.credit.body") },
    { icon: Shield, title: tp("layers.enterprise.title"), body: tp("layers.enterprise.body") },
  ];

  return (
    <Layout>
      <div className="relative overflow-hidden pt-24 pb-16">
        <div className="from-background via-background to-muted/30 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />

        <div className="relative z-10 container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <div className="bg-primary/10 border-primary/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
              <Sparkles className="text-primary h-4 w-4" />
              <span className="text-primary text-xs font-medium">{tp("badge")}</span>
            </div>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              {tp("title")} <span className="gradient-text">{tp("title_gradient")}</span>
            </h1>
            <p className="text-muted-foreground">{tp("subtitle")}</p>
          </div>

          <div className="mx-auto mb-16 grid max-w-5xl gap-8 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`card-hover relative rounded-2xl border p-8 transition-all duration-300 ${
                  plan.popular
                    ? "bg-card border-primary z-10 scale-105 shadow-xl"
                    : "bg-card border-border hover:border-primary/50"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="from-primary to-accent bg-gradient-to-r px-4 py-1 text-white shadow-lg">
                      <Sparkles className="mr-1 h-3 w-3" />
                      {t("most_popular")}
                    </Badge>
                  </div>
                )}

                <div className="mb-6 text-center">
                  <h2 className="mb-2 text-xl font-semibold">{plan.name}</h2>
                  <p className="text-muted-foreground mb-4 text-sm">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period ? <span className="text-muted-foreground">{plan.period}</span> : null}
                  </div>
                </div>

                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="text-accent mt-0.5 h-5 w-5 shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.external ? (
                  <Button variant={plan.variant} className="w-full" asChild>
                    <NextLink href={plan.href}>{plan.cta}</NextLink>
                  </Button>
                ) : (
                  <Button variant={plan.variant} className="w-full" asChild>
                    <Link to={plan.href}>{plan.cta}</Link>
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mx-auto mb-8 max-w-3xl text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
              <Zap className="text-primary h-4 w-4" />
              <span className="text-primary text-xs font-medium uppercase">{tp("layers.kicker")}</span>
            </div>
            <h2 className="mb-3 text-2xl font-bold md:text-3xl">
              {tp("layers.title")} <span className="gradient-text">{tp("layers.title_gradient")}</span>
            </h2>
            <p className="text-muted-foreground">{tp("layers.subtitle")}</p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {layers.map((layer) => (
              <div key={layer.title} className="bg-card border-border rounded-2xl border p-6">
                <div className="from-primary/15 to-accent/15 mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br">
                  <layer.icon className="text-primary h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{layer.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{layer.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Packages;
