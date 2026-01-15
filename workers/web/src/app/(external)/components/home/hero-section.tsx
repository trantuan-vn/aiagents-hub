"use client";

import { useEffect } from "react";

import { ArrowRight, Play, Sparkles, Shield, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { Button } from "../ui/button";

const HeroSection = () => {
  const t = useTranslations("Hero");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  // Sync theme with document
  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      {/* Background */}
      <div className="from-background via-background to-muted/30 absolute inset-0 bg-gradient-to-b" />
      <div className="bg-grid absolute inset-0 opacity-50" />

      {/* Gradient orbs */}
      <div className="bg-primary/20 animate-pulse-slow absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />
      <div className="bg-accent/20 animate-pulse-slow absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full blur-3xl delay-1000" />

      <div className="relative z-10 container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="bg-primary/10 border-primary/20 animate-fade-in mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-2">
            <Sparkles className="text-primary h-4 w-4" />
            <span className="text-primary text-sm font-medium">{t("badge")}</span>
          </div>

          {/* Heading */}
          <h1 className="animate-slide-up mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h1>

          {/* Subheading */}
          <p
            className="text-muted-foreground animate-slide-up mx-auto mb-10 max-w-2xl text-lg md:text-xl"
            style={{ animationDelay: "0.1s" }}
          >
            {t("subtitle")}
          </p>

          {/* CTA Buttons */}
          <div
            className="animate-slide-up mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: "0.2s" }}
          >
            <Link to="/packages">
              <Button variant="hero" size="xl">
                {t("explore_apis")}
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/docs">
              <Button variant="heroOutline" size="xl">
                <Play className="h-5 w-5" />
                {t("view_demo")}
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="animate-fade-in mx-auto grid max-w-lg grid-cols-3 gap-8" style={{ animationDelay: "0.4s" }}>
            <div className="text-center">
              <div className="text-foreground mb-1 text-3xl font-bold md:text-4xl">99.9%</div>
              <div className="text-muted-foreground text-sm">{t("uptime_sla")}</div>
            </div>
            <div className="text-center">
              <div className="text-foreground mb-1 text-3xl font-bold md:text-4xl">50M+</div>
              <div className="text-muted-foreground text-sm">{t("api_calls_per_day")}</div>
            </div>
            <div className="text-center">
              <div className="text-foreground mb-1 text-3xl font-bold md:text-4xl">10K+</div>
              <div className="text-muted-foreground text-sm">{t("developers")}</div>
            </div>
          </div>
        </div>

        {/* Feature Pills */}
        <div
          className="animate-fade-in mt-16 flex flex-wrap items-center justify-center gap-4"
          style={{ animationDelay: "0.5s" }}
        >
          {[
            { icon: Zap, label: t("low_latency") },
            { icon: Shield, label: t("enterprise_security") },
            { icon: Sparkles, label: t("ai_powered") },
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

      {/* Bottom gradient fade */}
      <div className="from-background absolute right-0 bottom-0 left-0 h-32 bg-gradient-to-t to-transparent" />
    </section>
  );
};

export default HeroSection;
