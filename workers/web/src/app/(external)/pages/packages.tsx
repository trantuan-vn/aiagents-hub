"use client";

import { useEffect } from "react";

import { Building2, Check, Coins, Shield, Sparkles, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useLocation } from "react-router-dom";

import Layout from "../components/layout/main-layout";
import { PlanCatalog } from "../components/packages/plan-catalog";
import { Button } from "../components/ui/button";

const Packages = () => {
  const tp = useTranslations("PackagesPage");
  const { hash } = useLocation();
  const enterpriseItems = tp.raw("enterprise.items") as string[];

  useEffect(() => {
    if (hash === "#enterprise") document.getElementById("enterprise")?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

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

          <PlanCatalog />

          <section
            id="enterprise"
            className="border-border bg-card mx-auto mt-16 max-w-5xl scroll-mt-24 rounded-2xl border p-6 md:p-8"
          >
            <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
              <div>
                <div className="border-primary/20 bg-primary/5 mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1">
                  <Building2 className="text-primary h-4 w-4" />
                  <span className="text-primary text-xs font-medium uppercase">{tp("enterprise.kicker")}</span>
                </div>
                <h2 className="mb-3 text-2xl font-bold md:text-3xl">
                  {tp("enterprise.title")} <span className="gradient-text">{tp("enterprise.title_gradient")}</span>
                </h2>
                <p className="text-muted-foreground mb-6 text-sm leading-relaxed">{tp("enterprise.body")}</p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="gradient" asChild>
                    <Link to="/contact?topic=enterprise">{tp("enterprise.cta_contact")}</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/docs/enterprise">{tp("enterprise.cta_docs")}</Link>
                  </Button>
                </div>
              </div>
              <ul className="space-y-3">
                {enterpriseItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="text-accent mt-0.5 h-5 w-5 shrink-0" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div className="mx-auto mt-16 mb-8 max-w-3xl text-center">
            <div className="border-primary/20 bg-primary/5 mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1">
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
