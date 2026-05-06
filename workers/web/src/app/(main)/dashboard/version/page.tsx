"use client";

import { useEffect, useState } from "react";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { SaveVersionDialog } from "./_components/save-version-dialog";
import type { VersionData, VersionInfo, VersionListResponse, VersionSaveResponse } from "./_components/schema";
import { VersionList } from "./_components/version-list";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export default function VersionPage() {
  const t = useTranslations("VersionPage");
  const { toast } = useToast();
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/version/list`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("fetch_error"));
      }

      const data: VersionListResponse = await response.json();
      setVersions(data.versions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveVersion = async (): Promise<VersionSaveResponse> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/version/save`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("save_error"));
    }

    const result = await response.json();
    void fetchVersions(); // Refresh the list
    return result as VersionSaveResponse;
  };

  const handleViewVersion = async (versionId: string): Promise<VersionData> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/version/${versionId}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("view_error"));
    }

    return await response.json();
  };

  const handleUpgradeVersion = async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/version/upgrade`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("upgrade_error"));
    }

    void fetchVersions(); // Refresh the list
  };

  const totalVersions = versions.length;
  const totalRecords = versions.reduce((sum, v) => {
    if (v.recordCounts) {
      return sum + v.recordCounts.price_policies + v.recordCounts.services + v.recordCounts.vouchers;
    }
    return sum;
  }, 0);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <SaveVersionDialog onSave={handleSaveVersion} />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_versions")}</CardTitle>
            <RefreshCw className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVersions}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_versions_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_records")}</CardTitle>
            <AlertCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecords.toLocaleString()}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_records_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.latest_version")}</CardTitle>
            <RefreshCw className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{versions.length > 0 ? versions[0].version : "-"}</div>
            <p className="text-muted-foreground text-xs">{t("stats.latest_version_description")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Version List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <VersionList versions={versions} onView={handleViewVersion} onUpgrade={handleUpgradeVersion} />
      )}
    </div>
  );
}
