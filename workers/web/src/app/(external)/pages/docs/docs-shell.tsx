"use client";

import { ReactNode, useEffect, useState } from "react";

import { BookOpen, ChevronRight, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { DOCS_NAV, findDocsNavContext } from "./docs-nav";

export type DocsTocItem = { id: string; label: string };

function DocsNavLinks({ onNavigate, search }: { onNavigate?: () => void; search: string }) {
  const t = useTranslations("Docs");
  const location = useLocation();
  const q = search.trim().toLowerCase();

  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  return (
    <nav className="space-y-7" aria-label={t("nav_aria")}>
      {DOCS_NAV.map((section) => {
        const sectionTitle = t(section.titleKey as never);
        const items = section.items.filter((item) => matches(t(item.labelKey as never)) || matches(sectionTitle));
        if (items.length === 0) return null;
        return (
          <div key={section.titleKey}>
            <p className="text-muted-foreground mb-2 px-3 text-[11px] font-semibold tracking-wider uppercase">
              {sectionTitle}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const label = t(item.labelKey as never);
                const active =
                  item.href === "/docs"
                    ? location.pathname === "/docs"
                    : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "block rounded-lg px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function DocsSearch({
  search,
  onChange,
}: {
  search: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Docs");
  return (
    <div className="relative">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
      <Input
        value={search}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("search_placeholder")}
        className="bg-background h-9 pl-9"
        aria-label={t("search_placeholder")}
      />
    </div>
  );
}

function DocsToc({ items }: { items: DocsTocItem[] }) {
  const t = useTranslations("Docs");
  if (items.length === 0) return null;
  return (
    <nav aria-label={t("toc.aria")} className="space-y-3">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">{t("toc.title")}</p>
      <ul className="border-border space-y-1 border-l">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-muted-foreground hover:text-foreground block py-1 pl-3 text-sm transition-colors"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function DocsShell({
  children,
  title,
  description,
  toc,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  toc?: DocsTocItem[];
}) {
  const t = useTranslations("Docs");
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { sectionTitleKey } = findDocsNavContext(location.pathname);

  useEffect(() => {
    document.title = `${title} · AI Agents Hub`;
    return () => {
      document.title = "AI Agents Hub";
    };
  }, [title]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative">
      <div className="from-primary/8 via-background to-accent/5 border-border/60 relative border-b">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="relative container mx-auto px-4 pt-24 pb-8 md:pt-28 md:pb-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-muted-foreground mb-3 flex flex-wrap items-center gap-1.5 text-sm">
                <BookOpen className="text-primary h-4 w-4" />
                <Link to="/docs" className="hover:text-foreground transition-colors">
                  {t("badge")}
                </Link>
                {sectionTitleKey ? (
                  <>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>{t(sectionTitleKey as never)}</span>
                  </>
                ) : null}
              </div>
              <h1 className="text-foreground text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
              {description ? (
                <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed md:text-lg">
                  {description}
                </p>
              ) : null}
            </div>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="w-fit lg:hidden">
                  <Menu className="mr-2 h-4 w-4" />
                  {t("menu")}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100%,320px)] p-0">
                <SheetHeader className="border-border border-b px-4 py-3 text-left">
                  <SheetTitle>{t("mobile_nav_title")}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-5rem)] px-4 py-4">
                  <div className="mb-4">
                    <DocsSearch search={search} onChange={setSearch} />
                  </div>
                  <DocsNavLinks onNavigate={() => setMobileOpen(false)} search={search} />
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          <aside className="hidden w-56 shrink-0 lg:block xl:w-60">
            <div className="sticky top-24 space-y-4">
              <DocsSearch search={search} onChange={setSearch} />
              <DocsNavLinks search={search} />
            </div>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
          {toc && toc.length > 0 ? (
            <aside className="hidden w-48 shrink-0 xl:block">
              <div className="sticky top-24">
                <DocsToc items={toc} />
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
