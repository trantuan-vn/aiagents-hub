"use client";

import { useState } from "react";

import { Calendar, ExternalLink, Server, Trash2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

import type { Service } from "./schema";

interface ServiceItemProps {
  service: Service;
  deletingServiceId: string | number | null;
  onDelete: (serviceId: string | number) => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  t: (key: string, params?: Record<string, string>) => string;
  canDelete?: boolean;
}

type TranslateFn = (key: string, params?: Record<string, string>) => string;

function serviceVisualState(service: Service, t: TranslateFn) {
  const isExpired = Boolean(service.expiresAt && new Date(service.expiresAt) < new Date());
  if (!service.isActive) {
    return { badgeVariant: "secondary" as const, statusLabel: t("status.inactive") };
  }
  if (isExpired) {
    return { badgeVariant: "destructive" as const, statusLabel: t("status.expired") };
  }
  return { badgeVariant: "default" as const, statusLabel: t("status.active") };
}

function ServicePricingLabel({ service, t }: { service: Service; t: TranslateFn }) {
  if (typeof service.fixedPrice === "number" && !Number.isNaN(service.fixedPrice)) {
    return <span>{t("pricing_fixed", { amount: service.fixedPrice.toLocaleString() })}</span>;
  }
  return <span>{t("pricing_gateway")}</span>;
}

function ServiceItemContent({
  service,
  formatDate,
  t,
}: {
  service: Service;
  formatDate: (dateString: string | undefined) => string;
  t: TranslateFn;
}) {
  const { badgeVariant, statusLabel } = serviceVisualState(service, t);

  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
        <Server className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">{service.name}</span>
          <Badge variant={badgeVariant} className="text-xs">
            {statusLabel}
          </Badge>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <div className="flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            <span className="max-w-xs truncate">{service.endpoint}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>
              {t("calls", {
                current: String(service.currentCalls),
                max: String(service.maxCalls),
              })}
            </span>
          </div>
          <ServicePricingLabel service={service} t={t} />
          {service.expiresAt && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(service.expiresAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceItemActions({
  service,
  deletingServiceId,
  onDelete,
  t,
  canDelete,
}: {
  service: Service;
  deletingServiceId: string | number | null;
  onDelete: (serviceId: string | number) => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
  canDelete?: boolean;
}) {
  const serviceId = service.id;
  if (!serviceId || !canDelete) return null;

  return (
    <div className="flex items-center gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" disabled={deletingServiceId === serviceId} title={t("cancel")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancel_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancel_confirm_description", { name: service.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onDelete(serviceId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("cancel_service")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ServiceItem({ service, deletingServiceId, onDelete, formatDate, t, canDelete }: ServiceItemProps) {
  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-lg p-4">
      <ServiceItemContent service={service} formatDate={formatDate} t={t} />
      <ServiceItemActions
        service={service}
        deletingServiceId={deletingServiceId}
        onDelete={onDelete}
        t={t}
        canDelete={canDelete}
      />
    </div>
  );
}

interface ServiceListProps {
  services: Service[];
  onDelete: (serviceId: string | number) => Promise<void>;
  canDelete?: boolean;
}

export function ServiceList({ services, onDelete, canDelete = false }: ServiceListProps) {
  const t = useTranslations("ServicePage");
  const { toast } = useToast();
  const [deletingServiceId, setDeletingServiceId] = useState<string | number | null>(null);

  const handleDelete = async (serviceId: string | number): Promise<void> => {
    setDeletingServiceId(serviceId);
    try {
      await onDelete(serviceId);
      toast({
        title: t("service_cancelled"),
        description: t("service_cancelled_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("cancel_error"),
        variant: "destructive",
      });
    } finally {
      setDeletingServiceId(null);
    }
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return t("never_expires");
    return new Date(dateString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Server className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-center">{t("no_services")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("services")}</CardTitle>
          <CardDescription>{t("services_description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {services.map((service) => (
            <ServiceItem
              key={service.id}
              service={service}
              deletingServiceId={deletingServiceId}
              onDelete={handleDelete}
              formatDate={formatDate}
              t={t}
              canDelete={canDelete}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
