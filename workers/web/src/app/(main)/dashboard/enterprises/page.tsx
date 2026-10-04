"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useRequireAdmin } from "../_hooks/use-require-admin";

import { EnterpriseWorkflowsTab } from "./_components/enterprise-workflows-tab";
import { FlagRequestsTab } from "./_components/flag-requests-tab";
import { OrganizationsTab } from "./_components/organizations-tab";

export default function EnterprisesAdminPage() {
  const t = useTranslations("EnterpriseAdminPage");
  const isAdmin = useRequireAdmin();
  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Building2 className="text-muted-foreground h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
        </div>
      </div>

      <Tabs defaultValue="organizations">
        <TabsList>
          <TabsTrigger value="organizations">{t("tab_organizations")}</TabsTrigger>
          <TabsTrigger value="requests">{t("tab_requests")}</TabsTrigger>
          <TabsTrigger value="workflows">{t("tab_workflows")}</TabsTrigger>
        </TabsList>
        <TabsContent value="organizations" className="mt-4">
          <OrganizationsTab />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <FlagRequestsTab />
        </TabsContent>
        <TabsContent value="workflows" className="mt-4">
          <EnterpriseWorkflowsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
