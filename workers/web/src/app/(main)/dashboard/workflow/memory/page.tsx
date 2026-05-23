"use client";

import { useState } from "react";

import { Cloud, Database, HardDrive, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useRequireAdmin } from "../../_hooks/use-require-admin";

const INTERNAL_MEMORY = [
  { id: "r2", nameKey: "mem_r2", descKey: "mem_r2_desc" },
  { id: "d1", nameKey: "mem_d1", descKey: "mem_d1_desc" },
  { id: "vectorize", nameKey: "mem_vectorize", descKey: "mem_vectorize_desc" },
] as const;

const EXTERNAL_MEMORY = [
  { id: "postgres", nameKey: "mem_postgres", descKey: "mem_postgres_desc" },
  { id: "mysql", nameKey: "mem_mysql", descKey: "mem_mysql_desc" },
  { id: "mongodb", nameKey: "mem_mongodb", descKey: "mem_mongodb_desc" },
  { id: "redis", nameKey: "mem_redis", descKey: "mem_redis_desc" },
  { id: "pinecone", nameKey: "mem_pinecone", descKey: "mem_pinecone_desc" },
] as const;

export default function WorkflowMemoryAdminPage() {
  const t = useTranslations("WorkflowAdminPage");
  const isAdmin = useRequireAdmin();
  const [query, setQuery] = useState("");

  if (!isAdmin) return null;

  const q = query.trim().toLowerCase();
  const filter = (items: readonly { id: string; nameKey: string; descKey: string }[]) =>
    items.filter((item) => !q || t(item.nameKey).toLowerCase().includes(q) || t(item.descKey).toLowerCase().includes(q));

  const internal = filter(INTERNAL_MEMORY);
  const external = filter(EXTERNAL_MEMORY);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("memory_title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("memory_description")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
        <Input
          className="pl-9"
          placeholder={t("search_memory")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Tabs defaultValue="internal">
        <TabsList>
          <TabsTrigger value="internal">
            <HardDrive className="mr-1.5 h-4 w-4" />
            {t("memory_internal")}
          </TabsTrigger>
          <TabsTrigger value="external">
            <Cloud className="mr-1.5 h-4 w-4" />
            {t("memory_external")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4">
          <MemoryGrid items={internal} badge={t("badge_internal")} t={t} icon={Database} />
        </TabsContent>
        <TabsContent value="external" className="mt-4">
          <MemoryGrid items={external} badge={t("badge_external")} t={t} icon={Cloud} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MemoryGrid({
  items,
  badge,
  t,
  icon: Icon,
}: {
  items: readonly { id: string; nameKey: string; descKey: string }[];
  badge: string;
  t: ReturnType<typeof useTranslations<"WorkflowAdminPage">>;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {badge}
        </CardTitle>
        <CardDescription>{t("memory_catalog_hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="hover:bg-muted/50 rounded-lg border p-3 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{t(item.nameKey)}</p>
                <p className="text-muted-foreground mt-1 text-xs">{t(item.descKey)}</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {badge}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
