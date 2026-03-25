"use client";

import { useMemo } from "react";

import { ArrowRight, BookOpen, Fingerprint, Sparkles, Workflow } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

import Layout from "../components/layout/main-layout";
import { Button } from "../components/ui/button";
import { BLOG_POST_METAS, type BlogCategory } from "../data/blog-posts";

function formatPostDate(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "vi-VN" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function PostCard({
  slug,
  category,
  date,
  readMinutes,
}: {
  slug: string;
  category: BlogCategory;
  date: string;
  readMinutes: number;
}) {
  const t = useTranslations("BlogPage");
  const locale = useLocale();

  return (
    <article className="hover:border-primary/30 bg-card border-border group flex h-full flex-col rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={category === "ekyc" ? "default" : "secondary"} className="font-medium">
          {category === "ekyc" ? t("section_ekyc") : t("section_claw")}
        </Badge>
        {category === "claw" && (
          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
            {t("badge_upcoming")}
          </Badge>
        )}
      </div>
      <h2 className="group-hover:text-primary mb-2 text-lg font-semibold tracking-tight transition-colors md:text-xl">
        <Link to={`/blog/${slug}`}>{t(`posts.${slug}.title` as never)}</Link>
      </h2>
      <p className="text-muted-foreground mb-6 line-clamp-3 flex-1 text-sm leading-relaxed">
        {t(`posts.${slug}.excerpt` as never)}
      </p>
      <div className="text-muted-foreground mt-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        <span>{formatPostDate(date, locale)}</span>
        <span>{t("min_read", { count: readMinutes })}</span>
      </div>
      <div className="border-border mt-5 border-t pt-4">
        <Link
          to={`/blog/${slug}`}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {t("read_more")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}

const Blog = () => {
  const t = useTranslations("BlogPage");

  const { ekyc, claw } = useMemo(() => {
    const ekyc = BLOG_POST_METAS.filter((p) => p.category === "ekyc");
    const claw = BLOG_POST_METAS.filter((p) => p.category === "claw");
    return { ekyc, claw };
  }, []);

  return (
    <Layout>
      <div className="relative overflow-hidden">
        <div className="from-background via-background to-muted/40 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="bg-primary/12 animate-pulse-slow absolute top-24 -left-16 h-[380px] w-[380px] rounded-full blur-3xl" />
        <div className="bg-accent/12 animate-pulse-slow absolute -right-20 bottom-40 h-[360px] w-[360px] rounded-full blur-3xl delay-1000" />

        <section className="relative z-10 pt-28 pb-14 md:pt-32 md:pb-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5">
                <BookOpen className="text-primary h-4 w-4" />
                <span className="text-primary text-xs font-semibold tracking-wide uppercase">{t("badge")}</span>
              </div>
              <h1 className="mb-5 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
                {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
              </h1>
              <p className="text-muted-foreground mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
                {t("subtitle")}
              </p>
              <p className="text-muted-foreground/90 mt-6 text-sm">{t("byline", { author: t("author_display") })}</p>
            </div>
          </div>
        </section>

        <section className="relative z-10 pb-16 md:pb-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-10 flex max-w-6xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Fingerprint className="text-primary h-5 w-5" />
                  <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t("section_ekyc")}</h2>
                </div>
                <p className="text-muted-foreground max-w-2xl text-sm md:text-base">{t("section_ekyc_sub")}</p>
              </div>
            </div>
            <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
              {ekyc.map((p) => (
                <PostCard key={p.slug} slug={p.slug} category={p.category} date={p.date} readMinutes={p.readMinutes} />
              ))}
            </div>
          </div>
        </section>

        <section className="border-border bg-muted/15 relative z-10 border-y py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto mb-10 flex max-w-6xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Workflow className="text-primary h-5 w-5" />
                  <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t("section_claw")}</h2>
                  <Sparkles className="h-5 w-5 text-amber-500" aria-hidden />
                </div>
                <p className="text-muted-foreground max-w-2xl text-sm md:text-base">{t("section_claw_sub")}</p>
              </div>
            </div>
            <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
              {claw.map((p) => (
                <PostCard key={p.slug} slug={p.slug} category={p.category} date={p.date} readMinutes={p.readMinutes} />
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 pt-12 pb-24">
          <div className="container mx-auto px-4">
            <div className="border-border bg-card/80 mx-auto max-w-3xl rounded-2xl border p-8 text-center shadow-sm backdrop-blur-sm">
              <p className="text-muted-foreground mb-4 text-sm">{t("cta_lead")}</p>
              <Button variant="gradient" asChild>
                <Link to="/contact">{t("cta_contact")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Blog;
