"use client";

import { ArrowLeft, Calendar, Clock, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";

import Layout from "../components/layout/main-layout";
import { Button } from "../components/ui/button";
import { BLOG_AUTHOR_EMAIL, getPostMeta, type BlogCategory } from "../data/blog-posts";

function loadPostTranslations(
  slug: string,
  t: {
    (key: string): string;
    raw: (key: string) => unknown;
  },
): { title: string; excerpt: string; body: string[] } {
  const title = t(`posts.${slug}.title` as never);
  const excerpt = t(`posts.${slug}.excerpt` as never);
  const rawBody = t.raw(`posts.${slug}.body` as never);
  const body = Array.isArray(rawBody) ? (rawBody as string[]) : [];
  return { title, excerpt, body };
}

function formatPostDate(iso: string, locale: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === "vi-VN" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function BlogPostNotFound() {
  const t = useTranslations("BlogPage");
  return (
    <Layout>
      <div className="container mx-auto max-w-2xl px-4 pt-32 pb-24 text-center">
        <h1 className="mb-3 text-2xl font-bold">{t("not_found_title")}</h1>
        <p className="text-muted-foreground mb-8">{t("not_found_body")}</p>
        <Button asChild variant="outline">
          <Link to="/blog">{t("back_to_blog")}</Link>
        </Button>
      </div>
    </Layout>
  );
}

function BlogPostArticle({
  slug,
  category,
  title,
  excerpt,
  body,
  publishedDate,
  readMinutes,
}: {
  slug: string;
  category: BlogCategory;
  title: string;
  excerpt: string;
  body: string[];
  publishedDate: string;
  readMinutes: number;
}) {
  const t = useTranslations("BlogPage");
  const locale = useLocale();

  return (
    <Layout>
      <article className="relative overflow-hidden">
        <div className="from-background via-background to-muted/30 absolute inset-0 bg-gradient-to-b" />
        <div className="bg-grid absolute inset-0 opacity-30" />

        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-28 pb-20 md:pt-32 md:pb-28">
          <div className="mb-8">
            <Button variant="ghost" size="sm" className="text-muted-foreground mb-6 -ml-2 gap-1" asChild>
              <Link to="/blog">
                <ArrowLeft className="h-4 w-4" />
                {t("back_to_blog")}
              </Link>
            </Button>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge variant={category === "ekyc" ? "default" : "secondary"}>
                {category === "ekyc" ? t("section_ekyc") : t("section_claw")}
              </Badge>
              {category === "claw" && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                  {t("badge_upcoming")}
                </Badge>
              )}
            </div>

            <h1 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-tight">
              {title}
            </h1>

            <p className="text-muted-foreground mb-8 text-lg leading-relaxed">{excerpt}</p>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 border-b pb-8 text-sm">
              <span className="inline-flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                <a
                  href={`mailto:${BLOG_AUTHOR_EMAIL}`}
                  className="hover:text-foreground font-medium underline-offset-4 hover:underline"
                >
                  {BLOG_AUTHOR_EMAIL}
                </a>
              </span>
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                {formatPostDate(publishedDate, locale)}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                {t("min_read", { count: readMinutes })}
              </span>
            </div>
          </div>

          <div className="space-y-5 text-base leading-relaxed md:text-lg">
            {body.map((paragraph) => (
              <p key={`${slug}-${paragraph.slice(0, 48)}`} className="text-foreground/90">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="border-border mt-14 border-t pt-10">
            <Button variant="gradient" asChild>
              <Link to="/blog">{t("back_to_blog")}</Link>
            </Button>
          </div>
        </div>
      </article>
    </Layout>
  );
}

const BlogPostPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const t = useTranslations("BlogPage");
  const meta = slug ? getPostMeta(slug) : undefined;
  if (!slug || !meta) {
    return <BlogPostNotFound />;
  }
  const { title, excerpt, body } = loadPostTranslations(slug, t);
  if (!title || !excerpt || body.length === 0) {
    return <BlogPostNotFound />;
  }

  return (
    <BlogPostArticle
      slug={slug}
      category={meta.category}
      title={title}
      excerpt={excerpt}
      body={body}
      publishedDate={meta.date}
      readMinutes={meta.readMinutes}
    />
  );
};

export default BlogPostPage;
