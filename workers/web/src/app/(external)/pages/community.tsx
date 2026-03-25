"use client";

import NextLink from "next/link";

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  Code2,
  CreditCard,
  FileText,
  Layers,
  Mail,
  MessageCircle,
  Rocket,
  Shield,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import Layout from "../components/layout/main-layout";

const Community = () => {
  const t = useTranslations("CommunityPage");

  const steps = [
    { step: "1", icon: Users, title: t("steps.1_title"), description: t("steps.1_desc") },
    { step: "2", icon: Layers, title: t("steps.2_title"), description: t("steps.2_desc") },
    { step: "3", icon: Rocket, title: t("steps.3_title"), description: t("steps.3_desc") },
  ];

  const pathCards = [
    {
      to: "/docs",
      icon: BookOpen,
      title: t("paths.docs.title"),
      description: t("paths.docs.description"),
      className: "md:col-span-1",
    },
    {
      to: "/docs/quickstart",
      icon: Zap,
      title: t("paths.quickstart.title"),
      description: t("paths.quickstart.description"),
      className: "md:col-span-1",
    },
    {
      to: "/docs/api",
      icon: Code2,
      title: t("paths.api.title"),
      description: t("paths.api.description"),
      className: "md:col-span-1",
    },
    {
      to: "/packages",
      icon: Layers,
      title: t("paths.packages.title"),
      description: t("paths.packages.description"),
      className: "md:col-span-1",
    },
    {
      to: "/support",
      icon: MessageCircle,
      title: t("paths.support.title"),
      description: t("paths.support.description"),
      className: "md:col-span-1",
    },
    {
      to: "/contact",
      icon: Mail,
      title: t("paths.contact.title"),
      description: t("paths.contact.description"),
      className: "md:col-span-1",
    },
    {
      to: "/blog",
      icon: FileText,
      title: t("paths.blog.title"),
      description: t("paths.blog.description"),
      className: "md:col-span-1 lg:col-span-2",
    },
    {
      to: "/careers",
      icon: Briefcase,
      title: t("paths.careers.title"),
      description: t("paths.careers.description"),
      className: "md:col-span-1 lg:col-span-2",
    },
  ];

  const ecosystem = [
    { icon: Zap, title: t("ecosystem.managed.title"), description: t("ecosystem.managed.description") },
    { icon: Shield, title: t("ecosystem.ekyc.title"), description: t("ecosystem.ekyc.description") },
    { icon: Wallet, title: t("ecosystem.auth.title"), description: t("ecosystem.auth.description") },
    { icon: CreditCard, title: t("ecosystem.billing.title"), description: t("ecosystem.billing.description") },
    { icon: Sparkles, title: t("ecosystem.claw.title"), description: t("ecosystem.claw.description") },
    {
      icon: BarChart3,
      title: t("ecosystem.observability.title"),
      description: t("ecosystem.observability.description"),
    },
  ];

  return (
    <Layout>
      <div className="relative overflow-hidden">
        <div className="from-background via-background to-muted/40 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="bg-primary/12 animate-pulse-slow absolute top-24 -left-16 h-[400px] w-[400px] rounded-full blur-3xl" />
        <div className="bg-accent/12 animate-pulse-slow absolute top-1/3 -right-20 h-[360px] w-[360px] rounded-full blur-3xl delay-1000" />

        <section className="relative z-10 pt-28 pb-12 md:pt-32 md:pb-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <Users className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-semibold tracking-wide uppercase">{t("badge")}</span>
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
                {t("subtitle")}
              </p>
              <div className="border-border/80 bg-card/80 mt-8 inline-flex flex-wrap items-center justify-center gap-3 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm">
                <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  {t("base_url_label")}
                </span>
                <code className="text-foreground bg-muted/80 rounded-lg px-3 py-1.5 font-mono text-sm">
                  https://api.unitoken.trade
                </code>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-16 md:pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
              <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
                {t("steps.title")} <span className="gradient-text">{t("steps.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground">{t("steps.subtitle")}</p>
            </div>
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
              {steps.map((item) => (
                <div
                  key={item.step}
                  className="bg-card border-border card-hover group hover:border-primary/35 relative overflow-hidden rounded-2xl border p-6 transition-all duration-300"
                >
                  <div className="text-primary/25 absolute -top-2 -right-2 font-mono text-7xl font-bold tabular-nums">
                    {item.step}
                  </div>
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

        <section className="border-border/60 bg-muted/15 relative z-10 border-y py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-3 text-2xl font-bold md:text-3xl">
                {t("paths.title")} <span className="gradient-text">{t("paths.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground">{t("paths.subtitle")}</p>
            </div>
            <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
              {pathCards.map((card) => (
                <Link
                  key={card.to}
                  to={card.to}
                  className={`bg-card border-border card-hover group hover:border-primary/40 focus-visible:ring-ring block rounded-2xl border p-5 transition-all duration-300 focus-visible:ring-2 focus-visible:outline-none ${card.className}`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="from-primary/15 to-accent/15 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br">
                      <card.icon className="text-primary h-5 w-5" />
                    </div>
                    <ArrowRight className="text-muted-foreground group-hover:text-primary h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <h3 className="mb-1.5 font-semibold">{card.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-3 text-2xl font-bold md:text-3xl">
                {t("ecosystem.title")} <span className="gradient-text">{t("ecosystem.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground">{t("ecosystem.subtitle")}</p>
            </div>
            <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {ecosystem.map((item) => (
                <div
                  key={item.title}
                  className="bg-card/80 border-border hover:border-primary/30 rounded-2xl border p-5 backdrop-blur-sm transition-colors"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/15 to-cyan-500/10">
                    <item.icon className="text-primary h-5 w-5" />
                  </div>
                  <h3 className="mb-2 font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-24">
          <div className="container mx-auto px-4">
            <div className="from-primary/12 via-background to-accent/12 border-border/70 relative mx-auto max-w-4xl overflow-hidden rounded-3xl border bg-gradient-to-br px-6 py-14 text-center md:px-12">
              <div className="bg-accent/10 absolute -right-16 -bottom-16 h-40 w-40 rounded-full blur-3xl" />
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
                  <Link to="/docs">
                    <Button variant="outline" size="lg" className="gap-2">
                      <BookOpen className="h-5 w-5" />
                      {t("cta.view_docs")}
                    </Button>
                  </Link>
                  <Link to="/contact">
                    <Button variant="ghost" size="lg" className="gap-2">
                      <Mail className="h-5 w-5" />
                      {t("cta.contact")}
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

export default Community;
