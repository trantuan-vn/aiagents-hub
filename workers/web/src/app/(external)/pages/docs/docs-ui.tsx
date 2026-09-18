"use client";

import { ReactNode } from "react";

import { ArrowLeft, ArrowRight, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

import Layout from "../../components/layout/main-layout";

import { findDocsNavContext } from "./docs-nav";
import { DocsShell, type DocsTocItem } from "./docs-shell";

export function DocsPage({
  title,
  description,
  toc,
  wide,
  children,
}: {
  title: string;
  description?: string;
  toc?: DocsTocItem[];
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Layout>
      <DocsShell title={title} description={description} toc={toc}>
        <article className={cn("space-y-10", wide ? "max-w-none" : "max-w-3xl")}>{children}</article>
        <DocsPager />
      </DocsShell>
    </Layout>
  );
}

export function DocsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 id={id} className="text-foreground scroll-mt-28 text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DocsP({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-muted-foreground text-base leading-relaxed", className)}>{children}</p>;
}

export function DocsList({ items }: { items: string[] }) {
  return (
    <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-base leading-relaxed">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function DocsCallout({
  variant = "info",
  title,
  children,
}: {
  variant?: "info" | "tip" | "warn";
  title: string;
  children: ReactNode;
}) {
  const Icon = variant === "warn" ? TriangleAlert : variant === "tip" ? Lightbulb : Info;
  return (
    <aside
      className={cn(
        "rounded-xl border p-4 sm:p-5",
        variant === "warn"
          ? "border-amber-500/30 bg-amber-500/8"
          : variant === "tip"
            ? "border-primary/25 bg-primary/5"
            : "border-border bg-muted/40",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="text-primary h-4 w-4 shrink-0" />
        <p className="text-foreground text-sm font-semibold">{title}</p>
      </div>
      <div className="text-muted-foreground text-sm leading-relaxed">{children}</div>
    </aside>
  );
}

export function DocsTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: string[][];
  caption?: string;
}) {
  return (
    <div className="border-border -mx-1 overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-foreground px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-border border-t">
              {row.map((cell, j) => (
                <td
                  key={`${i}-${j}`}
                  className={cn("text-muted-foreground px-4 py-3 align-top", j === 0 && "text-foreground font-medium")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocsSteps({
  steps,
}: {
  steps: { title: string; body: string; action?: ReactNode }[];
}) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-4 pb-8 last:pb-0">
          {index < steps.length - 1 ? (
            <span className="bg-border absolute top-9 bottom-0 left-4 w-px" aria-hidden />
          ) : null}
          <span className="bg-primary/10 text-primary relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {index + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-foreground font-semibold">{step.title}</p>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed sm:text-base">{step.body}</p>
            {step.action}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DocsLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const className =
    "group border-border hover:border-primary/40 bg-card block h-full rounded-2xl border p-5 transition-all duration-200 hover:shadow-md";
  const inner = (
    <>
      <div className="bg-primary/10 text-primary mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-foreground group-hover:text-primary mb-1.5 flex items-center gap-2 font-semibold transition-colors">
        {title}
        <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </p>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </>
  );

  if (href.startsWith("/auth")) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link to={href} className={className}>
      {inner}
    </Link>
  );
}

function DocsPager() {
  const t = useTranslations("Docs");
  const location = useLocation();
  const { previous, next } = findDocsNavContext(location.pathname);
  if (!previous && !next) return null;

  return (
    <nav className="border-border mt-14 grid gap-3 border-t pt-8 sm:grid-cols-2" aria-label={t("pager.aria")}>
      {previous ? (
        <Link
          to={previous.href}
          className="border-border hover:border-primary/40 hover:bg-muted/40 group flex items-start gap-3 rounded-xl border p-4 transition-colors"
        >
          <ArrowLeft className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" />
          <span>
            <span className="text-muted-foreground block text-xs tracking-wide uppercase">{t("pager.previous")}</span>
            <span className="text-foreground mt-1 block font-medium">{t(previous.labelKey as never)}</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to={next.href}
          className="border-border hover:border-primary/40 hover:bg-muted/40 group flex items-start justify-end gap-3 rounded-xl border p-4 text-right transition-colors"
        >
          <span>
            <span className="text-muted-foreground block text-xs tracking-wide uppercase">{t("pager.next")}</span>
            <span className="text-foreground mt-1 block font-medium">{t(next.labelKey as never)}</span>
          </span>
          <ArrowRight className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </nav>
  );
}
