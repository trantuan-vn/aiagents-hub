"use client";

import Link from "next/link";

import { GitBranch, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { MyWorkflowsTab } from "./_components/my-workflows-tab";
import { SharedWorkflowsTab } from "./_components/shared-workflows-tab";

export default function WorkflowsPage() {
  const t = useTranslations("WorkflowsPage");

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
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

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">{t("tab_mine")}</TabsTrigger>
          <TabsTrigger value="shared">{t("tab_shared")}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="mt-4">
          <MyWorkflowsTab />
        </TabsContent>
        <TabsContent value="shared" className="mt-4">
          <SharedWorkflowsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
