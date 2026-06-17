"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RefreshCw, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { dashboardApiErrorMessage, parseDashboardApiError } from "@/lib/dashboard-api-error";

import { useRequireAdmin } from "../_hooks/use-require-admin";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

type CatalogEntry = {
  id: string;
  addCategory: string;
  runtimeType: string;
  kind?: string;
  nameKey: string;
  descKey: string;
  hasBackend: boolean;
  hasFrontend: boolean;
  isActive: boolean;
  sortOrder?: number;
  updatedAt?: number;
};

export default function WorkflowNodesAdminPage() {
  const t = useTranslations("WorkflowNodeCatalogAdminPage");
  const { toast } = useToast();
  const isAdmin = useRequireAdmin();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const fetchEntries = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-node-catalog`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal,
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (errBody?.stepUpRequired) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("fetch_error")));
      }
      const data = (await response.json()) as { entries: CatalogEntry[] };
      setEntries(data.entries);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : t("fetch_error"),
        variant: "destructive",
      });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    void fetchEntries(controller.signal);
    return () => controller.abort();
  }, [fetchEntries, isAdmin]);

  const categories = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.addCategory));
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (categoryFilter !== "all" && entry.addCategory !== categoryFilter) return false;
      if (!q) return true;
      return (
        entry.id.toLowerCase().includes(q) ||
        entry.runtimeType.toLowerCase().includes(q) ||
        (entry.kind ?? "").toLowerCase().includes(q) ||
        entry.nameKey.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, entries, query]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-node-catalog/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (errBody?.stepUpRequired) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("sync_error")));
      }
      const data = (await response.json()) as { synced: number; entries: CatalogEntry[] };
      setEntries(data.entries);
      toast({ title: t("synced"), description: t("synced_description", { count: data.synced }) });
    } catch (err) {
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : t("sync_error"),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (entry: CatalogEntry, isActive: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/workflow-node-catalog/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) {
        const errBody = await parseDashboardApiError(response);
        if (errBody?.stepUpRequired) return;
        throw new Error(dashboardApiErrorMessage(errBody, t("update_error")));
      }
      const data = (await response.json()) as { entry: CatalogEntry };
      setEntries((prev) => prev.map((row) => (row.id === entry.id ? data.entry : row)));
    } catch (err) {
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : t("update_error"),
        variant: "destructive",
      });
    }
  };

  const activeCount = entries.filter((entry) => entry.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={handleSync} disabled={syncing || loading}>
          <RefreshCw className={syncing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          {syncing ? t("syncing") : t("sync_seeds")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("summary_title")}</CardTitle>
          <CardDescription>
            {t("summary_description", { active: activeCount, total: entries.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {categories.map((category) => (
            <Button
              key={category}
              size="sm"
              variant={categoryFilter === category ? "default" : "outline"}
              onClick={() => setCategoryFilter(category)}
            >
              {category === "all" ? t("filter_all") : category}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="relative max-w-md">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <Input
          className="pl-9"
          placeholder={t("search_placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground p-6 text-sm">{t("loading")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_id")}</TableHead>
                  <TableHead>{t("col_category")}</TableHead>
                  <TableHead>{t("col_runtime")}</TableHead>
                  <TableHead>{t("col_implementation")}</TableHead>
                  <TableHead className="text-right">{t("col_active")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                    <TableCell>{entry.addCategory}</TableCell>
                    <TableCell>
                      <span className="font-medium">{entry.runtimeType}</span>
                      {entry.kind ? (
                        <span className="text-muted-foreground block text-xs">{entry.kind}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={entry.hasBackend ? "default" : "secondary"}>BE</Badge>
                        <Badge variant={entry.hasFrontend ? "default" : "secondary"}>FE</Badge>
                        {!entry.hasBackend || !entry.hasFrontend ? (
                          <Badge variant="outline">{t("badge_incomplete")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={entry.isActive}
                        onCheckedChange={(checked) => void handleToggle(entry, checked)}
                        aria-label={t("toggle_active", { id: entry.id })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
