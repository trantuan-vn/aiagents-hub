"use client";

import {
  Cookie,
  Globe2,
  Info,
  LayoutList,
  ListChecks,
  Mail,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import Layout from "../components/layout/main-layout";

const SECTION_ICONS = {
  intro: Info,
  what_are_cookies: Cookie,
  purposes: ListChecks,
  inventory: LayoutList,
  web3_ui: Wallet,
  third_party: Globe2,
  control: Settings,
  changes: RefreshCw,
  contact: Mail,
} as const;

type SectionKey = keyof typeof SECTION_ICONS;

const SECTION_ORDER: SectionKey[] = [
  "intro",
  "what_are_cookies",
  "purposes",
  "inventory",
  "web3_ui",
  "third_party",
  "control",
  "changes",
  "contact",
];

type CookieInventoryItem = {
  name: string;
  purpose: string;
  duration: string;
  type: string;
};

const Cookies = () => {
  const t = useTranslations("CookiesPage");

  return (
    <Layout>
      <div className="relative overflow-hidden">
        <div className="from-background via-background to-muted/40 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="bg-primary/12 animate-pulse-slow absolute top-16 -left-24 h-[400px] w-[400px] rounded-full blur-3xl" />
        <div className="bg-accent/12 animate-pulse-slow absolute top-1/3 -right-20 h-[360px] w-[360px] rounded-full blur-3xl delay-1000" />

        <article className="relative z-10 pt-28 pb-20 md:pt-32 md:pb-28">
          <div className="container mx-auto px-4">
            <header className="mx-auto mb-14 max-w-3xl text-center md:mb-16">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-semibold tracking-wide uppercase">{t("badge")}</span>
              </div>
              <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
                {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed">{t("subtitle")}</p>
              <p className="text-muted-foreground/80 mt-4 text-sm font-medium">{t("last_updated")}</p>
            </header>

            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-12 xl:gap-16">
              <aside className="lg:sticky lg:top-28 lg:self-start">
                <div className="bg-card/80 border-border rounded-2xl border p-5 shadow-sm backdrop-blur-sm">
                  <p className="text-foreground mb-4 text-sm font-semibold tracking-tight">{t("toc_title")}</p>
                  <nav aria-label={t("toc_aria")} className="flex flex-col gap-1">
                    {SECTION_ORDER.map((key) => (
                      <a
                        key={key}
                        href={`#${key}`}
                        className="text-muted-foreground hover:text-primary border-border/60 hover:border-primary/30 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors"
                      >
                        {t(`sections.${key}.title`)}
                      </a>
                    ))}
                  </nav>
                  <div className="border-border mt-6 border-t pt-6">
                    <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                      {t("related_title")}
                    </p>
                    <div className="flex flex-col gap-2">
                      <Link
                        to="/privacy"
                        className="text-primary hover:text-primary/90 text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {t("related_privacy")}
                      </Link>
                      <Link
                        to="/terms"
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {t("related_terms")}
                      </Link>
                      <Link
                        to="/contact"
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {t("related_contact")}
                      </Link>
                      <a
                        href="mailto:support@aiagents-hub.vn"
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        support@aiagents-hub.vn
                      </a>
                    </div>
                  </div>
                </div>
              </aside>

              <div className="min-w-0 space-y-12">
                {SECTION_ORDER.map((key) => {
                  const Icon = SECTION_ICONS[key];

                  if (key === "inventory") {
                    const paragraphs = t.raw(`sections.${key}.paragraphs`) as string[];
                    const items = t.raw(`sections.${key}.items`) as CookieInventoryItem[];
                    const headers = t.raw(`sections.${key}.headers`) as Record<keyof CookieInventoryItem, string>;
                    return (
                      <section
                        key={key}
                        id={key}
                        className="border-border/60 bg-card/40 scroll-mt-28 rounded-2xl border p-6 shadow-sm backdrop-blur-sm md:p-8"
                      >
                        <div className="mb-6 flex items-start gap-4">
                          <div className="from-primary/20 to-accent/15 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br">
                            <Icon className="text-primary h-5 w-5" aria-hidden />
                          </div>
                          <h2 className="text-foreground pt-1 text-xl font-semibold tracking-tight md:text-2xl">
                            {t(`sections.${key}.title`)}
                          </h2>
                        </div>
                        <div className="text-muted-foreground mb-6 space-y-4 text-[15px] leading-relaxed md:text-base">
                          {paragraphs.map((p, i) => (
                            <p key={`${key}-p-${i}`}>{p}</p>
                          ))}
                        </div>
                        <div className="border-border/80 bg-muted/20 overflow-x-auto rounded-xl border">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead>
                              <tr className="border-border/80 bg-muted/40 border-b">
                                <th className="text-foreground px-4 py-3 font-semibold">{headers.name}</th>
                                <th className="text-foreground px-4 py-3 font-semibold">{headers.purpose}</th>
                                <th className="text-foreground w-[140px] px-4 py-3 font-semibold">
                                  {headers.duration}
                                </th>
                                <th className="text-foreground w-[120px] px-4 py-3 font-semibold">{headers.type}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((row) => (
                                <tr
                                  key={row.name}
                                  className="border-border/60 hover:bg-muted/30 border-b last:border-b-0"
                                >
                                  <td className="text-foreground font-mono text-xs font-medium tracking-tight md:text-sm">
                                    {row.name}
                                  </td>
                                  <td className="text-muted-foreground px-4 py-3">{row.purpose}</td>
                                  <td className="text-muted-foreground px-4 py-3">{row.duration}</td>
                                  <td className="text-muted-foreground px-4 py-3">
                                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
                                      <Shield className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                                      {row.type}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-muted-foreground/90 mt-4 text-xs leading-relaxed">
                          {t("inventory_footnote")}
                        </p>
                      </section>
                    );
                  }

                  const paragraphs = t.raw(`sections.${key}.paragraphs`) as string[];
                  return (
                    <section
                      key={key}
                      id={key}
                      className="border-border/60 bg-card/40 scroll-mt-28 rounded-2xl border p-6 shadow-sm backdrop-blur-sm md:p-8"
                    >
                      <div className="mb-6 flex items-start gap-4">
                        <div className="from-primary/20 to-accent/15 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br">
                          <Icon className="text-primary h-5 w-5" aria-hidden />
                        </div>
                        <h2 className="text-foreground pt-1 text-xl font-semibold tracking-tight md:text-2xl">
                          {t(`sections.${key}.title`)}
                        </h2>
                      </div>
                      <div className="text-muted-foreground space-y-4 text-[15px] leading-relaxed md:text-base">
                        {paragraphs.map((p, i) => (
                          <p key={`${key}-${i}`}>{p}</p>
                        ))}
                      </div>
                    </section>
                  );
                })}

                <div className="border-primary/25 bg-primary/5 flex flex-col items-center justify-between gap-4 rounded-2xl border border-dashed px-6 py-8 text-center md:flex-row md:text-left">
                  <div>
                    <p className="text-foreground font-medium">{t("cta_title")}</p>
                    <p className="text-muted-foreground mt-1 max-w-xl text-sm">{t("cta_body")}</p>
                  </div>
                  <Button asChild>
                    <Link to="/contact">{t("cta_button")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </Layout>
  );
};

export default Cookies;
