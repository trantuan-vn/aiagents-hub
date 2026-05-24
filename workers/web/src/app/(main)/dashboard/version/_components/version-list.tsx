"use client";

import { useState } from "react";

import { Calendar, Eye, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

import type { VersionData, VersionInfo } from "./schema";

interface VersionItemProps {
  version: VersionInfo;
  onView: (versionId: string) => Promise<VersionData>;
  onUpgrade: () => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  t: (key: string, params?: Record<string, string>) => string;
}

function VersionItemContent({
  version,
  formatDate,
  t,
}: {
  version: VersionInfo;
  formatDate: (dateString: string | undefined) => string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const totalRecords = version.recordCounts
    ? (version.recordCounts.price_policies ?? 0) +
      version.recordCounts.services +
      version.recordCounts.vouchers +
      (version.recordCounts.commission_policies ?? 0)
    : 0;

  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
        <RefreshCw className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">{t("version_label", { version: version.version })}</span>
          <Badge variant="default" className="text-xs">
            {t("version")}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          {version.timestamp && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(version.timestamp)}
            </div>
          )}
          {version.recordCounts && (
            <>
              <div className="flex items-center gap-1">
                <span>{t("records.services", { count: String(version.recordCounts.services) })}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>{t("records.vouchers", { count: String(version.recordCounts.vouchers) })}</span>
              </div>
              <div className="flex items-center gap-1">
                <span>
                  {t("records.commission_policies", {
                    count: String(version.recordCounts.commission_policies ?? 0),
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">{t("records.total", { count: String(totalRecords) })}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionItemActions({
  version,
  viewingVersionId,
  onView,
  onUpgrade,
  t,
}: {
  version: VersionInfo;
  viewingVersionId: string | null;
  onView: (versionId: string) => Promise<VersionData>;
  onUpgrade: () => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [isViewing, setIsViewing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const { toast } = useToast();

  const handleView = async (): Promise<void> => {
    setIsViewing(true);
    try {
      const data = await onView(version.version);
      setVersionData(data);
    } catch (error) {
      console.error("Failed to load version data:", error);
    } finally {
      setIsViewing(false);
    }
  };

  const handleUpgrade = async (): Promise<void> => {
    setIsUpgrading(true);
    try {
      await onUpgrade();
      toast({
        title: t("version_upgraded"),
        description: t("version_upgraded_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("upgrade_error"),
        variant: "destructive",
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={viewingVersionId === version.version || isViewing}
            onClick={handleView}
            title={t("view")}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("version_details", { version: version.version })}</DialogTitle>
            <DialogDescription>{t("version_details_description")}</DialogDescription>
          </DialogHeader>
          {versionData ? (
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-semibold">{t("data.price_policies")}</h4>
                <pre className="bg-muted rounded-lg p-4 text-xs">
                  {JSON.stringify(versionData.data.price_policies, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">{t("data.services")}</h4>
                <pre className="bg-muted rounded-lg p-4 text-xs">
                  {JSON.stringify(versionData.data.services, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">{t("data.vouchers")}</h4>
                <pre className="bg-muted rounded-lg p-4 text-xs">
                  {JSON.stringify(versionData.data.vouchers, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-2 font-semibold">{t("data.commission_policies")}</h4>
                <pre className="bg-muted rounded-lg p-4 text-xs">
                  {JSON.stringify(versionData.data.commission_policies ?? [], null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">{isViewing ? t("loading") : t("no_data")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isUpgrading} title={t("upgrade")}>
            <RefreshCw className={`h-4 w-4 ${isUpgrading ? "animate-spin" : ""}`} />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("upgrade_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("upgrade_confirm_description", { version: version.version })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpgrade} disabled={isUpgrading}>
              {isUpgrading ? t("upgrading") : t("upgrade")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VersionItem({ version, onView, onUpgrade, formatDate, t }: VersionItemProps) {
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);

  const handleView = async (versionId: string): Promise<VersionData> => {
    setViewingVersionId(versionId);
    try {
      return await onView(versionId);
    } finally {
      setViewingVersionId(null);
    }
  };

  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-lg p-4">
      <VersionItemContent version={version} formatDate={formatDate} t={t} />
      <VersionItemActions
        version={version}
        viewingVersionId={viewingVersionId}
        onView={handleView}
        onUpgrade={onUpgrade}
        t={t}
      />
    </div>
  );
}

interface VersionListProps {
  versions: VersionInfo[];
  onView: (versionId: string) => Promise<VersionData>;
  onUpgrade: () => Promise<void>;
}

export function VersionList({ versions, onView, onUpgrade }: VersionListProps) {
  const t = useTranslations("VersionPage");

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return t("no_timestamp");
    return new Date(dateString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (versions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <RefreshCw className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-center">{t("no_versions")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("versions")}</CardTitle>
          <CardDescription>{t("versions_description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {versions.map((version) => (
            <VersionItem
              key={version.version}
              version={version}
              onView={onView}
              onUpgrade={onUpgrade}
              formatDate={formatDate}
              t={t}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
