"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Building2, GitBranch, Plus, Share2, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { EnterpriseWorkflowsTab } from "./_components/enterprise/enterprise-workflows-tab";
import { MyWorkflowsTab } from "./_components/list/my-workflows-tab";
import { SharedWorkflowsTab } from "./_components/list/shared-workflows-tab";

const VIEWS = ["mine", "shared", "enterprise"] as const;
type WorkflowLibrary = (typeof VIEWS)[number];

function parseLibrary(value: string | null): WorkflowLibrary {
  if (value === "shared" || value === "enterprise") return value;
  return "mine";
}

export default function WorkflowsPage() {
  const t = useTranslations("WorkflowsPage");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const library = parseLibrary(searchParams.get("view"));

  const sources: { id: WorkflowLibrary; icon: typeof Workflow; title: string; hint: string }[] = [
    { id: "mine", icon: Workflow, title: t("tab_mine"), hint: t("view_mine_hint") },
    { id: "shared", icon: Share2, title: t("tab_shared"), hint: t("view_shared_hint") },
    { id: "enterprise", icon: Building2, title: t("tab_enterprise"), hint: t("view_enterprise_hint") },
  ];

  const selectLibrary = (next: WorkflowLibrary) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "mine") params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <GitBranch className="text-muted-foreground h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/dashboard/build/workflows/new">
            <Plus className="mr-2 h-4 w-4" />
            {t("create")}
          </Link>
        </Button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-8">
        <nav
          aria-label={t("libraries_label")}
          className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {sources.map((source) => {
            const active = library === source.id;
            const Icon = source.icon;
            return (
              <button
                key={source.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => selectLibrary(source.id)}
                className={cn(
                  "flex w-[15.5rem] shrink-0 items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors lg:w-auto",
                  active
                    ? "border-primary/40 bg-primary/5 shadow-sm"
                    : "border-border/70 bg-card hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-5 font-medium">{source.title}</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs leading-4">{source.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="min-w-0">
          {library === "mine" ? <MyWorkflowsTab /> : null}
          {library === "shared" ? <SharedWorkflowsTab /> : null}
          {library === "enterprise" ? <EnterpriseWorkflowsTab /> : null}
        </section>
      </div>
    </div>
  );
}
