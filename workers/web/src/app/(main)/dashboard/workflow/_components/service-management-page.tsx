"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertCircle, ScanSearch, Server } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { useRequireAdmin } from "../../_hooks/use-require-admin";
import type { CreateService, Service, UpdateService } from "../../service/_components/schema";
import { filterServices, type ServiceStatusFilter } from "../../service/_components/service-filter";
import { ServiceFormDialog } from "../../service/_components/service-form-dialog";
import { ServiceList } from "../../service/_components/service-list";
import { ServiceListToolbar } from "../../service/_components/service-list-toolbar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function ServiceManagementPage() {
  const t = useTranslations("ServicePage");
  const { toast } = useToast();
  const isAdmin = useRequireAdmin();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>("all");

  const filteredServices = useMemo(
    () => filterServices(services, searchQuery, statusFilter),
    [services, searchQuery, statusFilter],
  );
  const isListFiltered = searchQuery.trim().length > 0 || statusFilter !== "all";

  const fetchServices = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/list`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("fetch_error"));
      }

      const data: Service[] = await response.json();
      setServices(data);
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
    if (!isAdmin) return;
    void fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleCreateService = async (data: CreateService): Promise<Service> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("create_error"));
    }

    const result: Service = await response.json();
    void fetchServices();
    return result;
  };

  const handleUpdateService = async (serviceId: string | number, data: UpdateService): Promise<Service> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/${serviceId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("update_error"));
    }

    const result: Service = await response.json();
    void fetchServices();
    return result;
  };

  const handleScanCloudflareModels = async (): Promise<void> => {
    setIsScanning(true);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/scan-cloudflare-models`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("scan_error"));
      }
      const result: { created: number; skipped: number; totalModels: number } = await response.json();
      toast({
        title: t("scan_success"),
        description: t("scan_success_description", {
          created: String(result.created),
          skipped: String(result.skipped),
          total: String(result.totalModels),
        }),
      });
      void fetchServices();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("scan_error");
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleApproveService = async (serviceId: string | number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/${serviceId}/approve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("approve_error"));
    }
    void fetchServices();
  };

  const handleCancelService = async (serviceId: string | number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/cancel/${serviceId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("cancel_error"));
    }

    void fetchServices();
  };

  if (!isAdmin) {
    return null;
  }

  const activeServices = services.filter((s) => s.isActive && (s.approvalStatus ?? "approved") === "approved");
  const pendingServices = services.filter((s) => (s.approvalStatus ?? "approved") === "pending");
  const withModelCount = services.filter((s) => s.model?.trim()).length;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={isScanning} onClick={() => void handleScanCloudflareModels()}>
            <ScanSearch className="mr-2 h-4 w-4" />
            {isScanning ? t("scanning") : t("scan_cloudflare_models")}
          </Button>
          <ServiceFormDialog mode="create" onCreate={handleCreateService} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_services")}</CardTitle>
            <Server className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_services_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.active_services")}</CardTitle>
            <Server className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeServices.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.active_services_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.pending_services")}</CardTitle>
            <AlertCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingServices.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.pending_services_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.with_model")}</CardTitle>
            <AlertCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{withModelCount}</div>
            <p className="text-muted-foreground text-xs">{t("stats.with_model_description")}</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ServiceListToolbar
            services={services}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            filteredCount={filteredServices.length}
          />
          <ServiceList
            services={filteredServices}
            isFiltered={isListFiltered}
            onDelete={handleCancelService}
            onUpdate={handleUpdateService}
            onApprove={handleApproveService}
          />
        </>
      )}
    </div>
  );
}
