"use client";

import {
  ArrowRight,
  Briefcase,
  Code2,
  Cpu,
  Mail,
  Server,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import Layout from "../components/layout/main-layout";

const CAREERS_EMAIL = "admin@unitoken.trade";

function mailtoHref(subject: string) {
  const q = new URLSearchParams({ subject });
  return `mailto:${CAREERS_EMAIL}?${q.toString()}`;
}

const JOB_KEYS = ["api_engineer", "devops", "dx"] as const;

const JOB_ICONS = {
  api_engineer: Server,
  devops: Cpu,
  dx: Code2,
} as const;

const Careers = () => {
  const t = useTranslations("CareersPage");

  const whyItems = [
    { icon: Zap, titleKey: "why.impact.title" as const, descKey: "why.impact.description" as const },
    { icon: Briefcase, titleKey: "why.ownership.title" as const, descKey: "why.ownership.description" as const },
    { icon: Users, titleKey: "why.stack.title" as const, descKey: "why.stack.description" as const },
  ];

  return (
    <Layout>
      <div className="relative overflow-hidden">
        <div className="from-background via-background to-muted/40 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="bg-primary/15 animate-pulse-slow absolute top-20 -left-20 h-[420px] w-[420px] rounded-full blur-3xl" />
        <div className="bg-accent/15 animate-pulse-slow absolute -right-24 bottom-32 h-[380px] w-[380px] rounded-full blur-3xl delay-1000" />

        <section className="relative z-10 pt-28 pb-14 md:pt-32 md:pb-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-semibold tracking-wide uppercase">{t("badge")}</span>
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">{t("subtitle")}</p>
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-16 md:pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
                {t("why.title")} <span className="gradient-text">{t("why.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground">{t("why.subtitle")}</p>
            </div>
            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
              {whyItems.map((item) => (
                <div
                  key={item.titleKey}
                  className="bg-card border-border card-hover group hover:border-primary/40 rounded-2xl border p-6 transition-all duration-300"
                >
                  <div className="from-primary/15 to-accent/15 mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br transition-transform duration-300 group-hover:scale-105">
                    <item.icon className="text-primary h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{t(item.titleKey)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{t(item.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-border/60 bg-muted/20 relative z-10 border-y py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-3 text-2xl font-bold md:text-3xl">
                {t("roles_section.title")}{" "}
                <span className="gradient-text">{t("roles_section.title_gradient")}</span>
              </h2>
              <p className="text-muted-foreground mb-4">{t("roles_section.subtitle")}</p>
              <Badge variant="secondary" className="font-normal">
                {t("roles_section.team_total")}
              </Badge>
            </div>

            <div className="mx-auto flex max-w-4xl flex-col gap-8">
              {JOB_KEYS.map((key) => {
                const Icon = JOB_ICONS[key];
                const responsibilities = t.raw(`jobs.${key}.responsibilities`) as string[];
                return (
                  <article
                    key={key}
                    className="from-card to-card/80 border-border group relative overflow-hidden rounded-3xl border bg-gradient-to-br p-1 shadow-lg transition-shadow duration-300 hover:shadow-xl"
                  >
                    <div className="from-primary/8 via-background to-accent/6 relative rounded-[1.35rem] bg-gradient-to-br p-6 md:p-8">
                      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl transition-opacity group-hover:opacity-100" />
                      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-4">
                          <div className="from-primary/20 to-accent/15 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br">
                            <Icon className="text-primary h-7 w-7" />
                          </div>
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <h3 className="text-xl font-bold tracking-tight md:text-2xl">{t(`jobs.${key}.title`)}</h3>
                              <Badge>{t(`jobs.${key}.headcount`)}</Badge>
                            </div>
                            <p className="text-muted-foreground text-sm">
                              <span className="text-foreground font-medium">{t(`jobs.${key}.employment`)}</span>
                              <span className="mx-2 text-muted-foreground/60">·</span>
                              {t(`jobs.${key}.location`)}
                            </p>
                          </div>
                        </div>
                        <Button className="shrink-0 gap-2" asChild>
                          <a href={mailtoHref(t(`jobs.${key}.apply_subject`))}>
                            <Mail className="h-4 w-4" />
                            {t(`jobs.${key}.apply_label`)}
                          </a>
                        </Button>
                      </div>
                      <p className="text-muted-foreground relative mt-6 max-w-3xl text-sm leading-relaxed md:text-base">
                        {t(`jobs.${key}.description`)}
                      </p>
                      <ul className="relative mt-6 space-y-2.5 border-t border-border/80 pt-6">
                        {responsibilities.map((line) => (
                          <li key={line} className="text-muted-foreground flex gap-3 text-sm leading-relaxed">
                            <span className="bg-primary mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-24 pt-8">
          <div className="container mx-auto px-4">
            <div className="from-primary/12 via-background to-accent/12 border-border/70 relative mx-auto max-w-4xl overflow-hidden rounded-3xl border bg-gradient-to-br px-6 py-14 text-center md:px-12">
              <div className="bg-primary/10 absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl" />
              <div className="relative z-10">
                <h2 className="mb-4 text-2xl font-bold md:text-4xl">
                  {t("cta.title")} <span className="gradient-text">{t("cta.title_gradient")}</span>
                </h2>
                <p className="text-muted-foreground mx-auto mb-10 max-w-xl text-lg">{t("cta.subtitle")}</p>
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Button variant="default" size="lg" className="gap-2" asChild>
                    <a href={mailtoHref(t("cta.apply_general_subject"))}>
                      {t("cta.apply_general")}
                      <ArrowRight className="h-5 w-5" />
                    </a>
                  </Button>
                  <Link to="/docs">
                    <Button variant="outline" size="lg">
                      {t("cta.browse_docs")}
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

export default Careers;
