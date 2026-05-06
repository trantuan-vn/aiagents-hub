"use client";

import NextLink from "next/link";

import { ArrowRight, BookOpen, Code2, Globe2, Layers, Shield, Sparkles, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import Layout from "../components/layout/main-layout";

const About = () => {
  const t = useTranslations("AboutPage");

  const values = [
    {
      icon: Layers,
      title: t("values.api_first.title"),
      description: t("values.api_first.description"),
    },
    {
      icon: Shield,
      title: t("values.trust.title"),
      description: t("values.trust.description"),
    },
    {
      icon: Code2,
      title: t("values.developer.title"),
      description: t("values.developer.description"),
    },
    {
      icon: Globe2,
      title: t("values.scale.title"),
      description: t("values.scale.description"),
    },
  ];

  const stats = [
    { value: t("stats.uptime.value"), label: t("stats.uptime.label") },
    { value: t("stats.latency.value"), label: t("stats.latency.label") },
    { value: t("stats.regions.value"), label: t("stats.regions.label") },
    { value: t("stats.sla.value"), label: t("stats.sla.label") },
  ];

  return (
    <Layout>
      <div className="relative overflow-hidden">
        <div className="from-background via-background to-muted/40 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="bg-primary/15 animate-pulse-slow absolute top-20 -left-20 h-[420px] w-[420px] rounded-full blur-3xl" />
        <div className="bg-accent/15 animate-pulse-slow absolute -right-24 bottom-32 h-[380px] w-[380px] rounded-full blur-3xl delay-1000" />

        {/* Hero */}
        <section className="relative z-10 pt-28 pb-16 md:pt-32 md:pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-semibold tracking-wide uppercase">{t("badge")}</span>
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
                {t("subtitle")}
              </p>
            </div>
          </div>
        </section>

        {/* Mission + terminal */}
        <section className="relative z-10 pb-20 md:pb-28">
          <div className="container mx-auto px-4">
            <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
              <div>
                <h2 className="mb-4 text-2xl font-bold tracking-tight md:text-3xl">{t("mission.title")}</h2>
                <p className="text-muted-foreground mb-6 text-lg leading-relaxed">{t("mission.lead")}</p>
                <p className="text-muted-foreground leading-relaxed">{t("mission.body")}</p>
              </div>
              <div className="relative">
                <div className="from-primary/20 to-accent/10 pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br opacity-60 blur-sm" />
                <div className="bg-card/95 border-border relative overflow-hidden rounded-2xl border p-6 shadow-xl backdrop-blur-sm">
                  <div className="border-border/80 mb-4 flex items-center gap-2 border-b pb-4">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/90" />
                    </div>
                    <span className="text-muted-foreground ml-2 font-mono text-[11px]">api.aiagents-hub.vn</span>
                  </div>
                  <pre className="text-muted-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap md:text-sm">
                    {t("mission.terminal")}
                  </pre>
                  <div className="border-primary/20 bg-primary/5 mt-4 flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Zap className="text-primary h-4 w-4 shrink-0" />
                    <p className="text-foreground text-xs font-medium">{t("mission.terminal_caption")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="border-border/60 bg-muted/20 relative z-10 border-y py-20 md:py-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="mb-4 text-2xl font-bold md:text-3xl">
                {t("values_section.title")} <span className="gradient-text">{t("values_section.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground">{t("values_section.subtitle")}</p>
            </div>
            <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {values.map((item) => (
                <div
                  key={item.title}
                  className="bg-card border-border card-hover group hover:border-primary/40 rounded-2xl border p-6 transition-all duration-300"
                >
                  <div className="from-primary/15 to-accent/15 mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br transition-transform duration-300 group-hover:scale-105">
                    <item.icon className="text-primary h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="relative z-10 py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="from-primary/8 via-background to-accent/8 border-border/80 mx-auto max-w-5xl rounded-3xl border bg-gradient-to-r p-8 md:p-10">
              <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-6">
                {stats.map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="text-foreground mb-1 text-3xl font-bold tracking-tight md:text-4xl">{s.value}</div>
                    <div className="text-muted-foreground text-sm">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 pb-24">
          <div className="container mx-auto px-4">
            <div className="from-primary/12 via-background to-accent/12 border-border/70 relative mx-auto max-w-4xl overflow-hidden rounded-3xl border bg-gradient-to-br px-6 py-14 text-center md:px-12">
              <div className="bg-primary/10 absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl" />
              <div className="relative z-10">
                <h2 className="mb-4 text-2xl font-bold md:text-4xl">
                  {t("cta.title")} <span className="gradient-text">{t("cta.title_gradient")}</span>
                </h2>
                <p className="text-muted-foreground mx-auto mb-10 max-w-xl text-lg">{t("cta.subtitle")}</p>
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Button variant="default" size="lg" asChild>
                    <NextLink href="/auth/v3/login">
                      {t("cta.get_started")}
                      <ArrowRight className="h-5 w-5" />
                    </NextLink>
                  </Button>
                  <Link to="/packages">
                    <Button variant="outline" size="lg">
                      {t("cta.view_packages")}
                    </Button>
                  </Link>
                  <Link to="/docs">
                    <Button variant="ghost" size="lg" className="gap-2">
                      <BookOpen className="h-5 w-5" />
                      {t("cta.view_docs")}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default About;
