"use client";

import { ReactNode, useState } from "react";

import { BookOpen, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { DOCS_NAV } from "./docs-nav";

function DocsNavLinks({ onNavigate, search }: { onNavigate?: () => void; search: string }) {
  const t = useTranslations("Docs");
  const location = useLocation();
  const q = search.trim().toLowerCase();

  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  return (
    <nav className="space-y-6" aria-label={t("nav_aria")}>
      {DOCS_NAV.map((section) => {
        const sectionTitle = t(section.titleKey);
        const items = section.items.filter((item) => matches(t(item.labelKey)));
        if (items.length === 0) return null;
        return (
          <div key={section.titleKey}>
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
              {sectionTitle}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const label = t(item.labelKey);
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
                        "hover:bg-muted block rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground",
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

export function DocsShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description?: string;
}) {
  const t = useTranslations("Docs");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  return (
    <div className="relative">
      <div className="from-primary/8 via-background to-accent/5 border-border/60 relative border-b">
        <div className="bg-grid absolute inset-0 opacity-40" />
        <div className="relative container mx-auto px-4 pt-28 pb-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="text-primary mb-3 inline-flex items-center gap-2 text-sm font-medium">
                <BookOpen className="h-4 w-4" />
                {t("badge")}
              </div>
              <h1 className="text-foreground text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
              {description ? (
                <p className="text-muted-foreground mt-3 text-base leading-relaxed md:text-lg">{description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
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
                      <div className="relative">
                        <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={t("search_placeholder")}
                          className="bg-background pl-9"
                          aria-label={t("search_placeholder")}
                        />
                      </div>
                    </div>
                    <DocsNavLinks onNavigate={() => setMobileOpen(false)} search={search} />
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          <aside className="hidden w-56 shrink-0 lg:block xl:w-64">
            <div className="sticky top-24 space-y-4">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("search_placeholder")}
                  className="bg-background pl-9"
                  aria-label={t("search_placeholder")}
                />
              </div>
              <DocsNavLinks search={search} />
            </div>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
