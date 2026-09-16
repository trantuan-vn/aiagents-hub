"use client";

import { useEffect } from "react";

import NextLink from "next/link";

import { ArrowRight, Coins, Play, Shield, Sparkles, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { Button } from "../ui/button";

const HeroSection = () => {
  const t = useTranslations("Hero");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      <div className="from-background via-background to-muted/30 absolute inset-0 bg-gradient-to-b" />
      <div className="bg-grid absolute inset-0 opacity-50" />

      <div className="bg-primary/20 animate-pulse-slow absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
      <div className="bg-accent/20 animate-pulse-slow absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl delay-1000" />

      <div className="relative z-10 container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="bg-primary/10 border-primary/20 animate-fade-in mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-2">
            <Sparkles className="text-primary h-4 w-4" />
            <span className="text-primary text-sm font-medium">{t("badge")}</span>
          </div>

          <h1 className="animate-slide-up mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h1>

          <p
            className="text-muted-foreground animate-slide-up mx-auto mb-10 max-w-2xl text-lg md:text-xl"
            style={{ animationDelay: "0.1s" }}
          >
            {t("subtitle")}
          </p>

          <div
            className="animate-slide-up mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "0.2s" }}
          >
            <Button variant="hero" size="xl" asChild>
              <NextLink href="/auth/v3/login">
                {t("get_started")}
                <ArrowRight className="h-5 w-5" />
              </NextLink>
            </Button>
            <Link to="/docs">
              <Button variant="heroOutline" size="xl">
                <Play className="h-5 w-5" />
                {t("view_docs")}
              </Button>
            </Link>
          </div>

          <div className="animate-fade-in mx-auto grid max-w-lg grid-cols-3 gap-8" style={{ animationDelay: "0.4s" }}>
            <div className="text-center">
              <div className="text-foreground mb-1 text-3xl font-bold md:text-4xl">{t("stat_credit_value")}</div>
              <div className="text-muted-foreground text-sm">{t("stat_credit_label")}</div>
            </div>
            <div className="text-center">
              <div className="text-foreground mb-1 text-3xl font-bold md:text-4xl">{t("stat_models_value")}</div>
              <div className="text-muted-foreground text-sm">{t("stat_models_label")}</div>
            </div>
            <div className="text-center">
              <div className="text-foreground mb-1 text-3xl font-bold md:text-4xl">{t("stat_plans_value")}</div>
              <div className="text-muted-foreground text-sm">{t("stat_plans_label")}</div>
            </div>
          </div>
        </div>

        <div
          className="animate-fade-in mt-16 flex flex-wrap items-center justify-center gap-4"
          style={{ animationDelay: "0.5s" }}
        >
          {[
            { icon: Workflow, label: t("pill_builder") },
            { icon: Coins, label: t("pill_credits") },
            { icon: Shield, label: t("pill_enterprise") },
          ].map((feature) => (
            <div
              key={feature.label}
              className="bg-card border-border flex items-center gap-2 rounded-full border px-4 py-2 shadow-sm"
            >
              <feature.icon className="text-primary h-4 w-4" />
              <span className="text-sm font-medium">{feature.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="from-background absolute right-0 bottom-0 left-0 h-32 bg-gradient-to-t to-transparent" />
    </section>
  );
};

export default HeroSection;
