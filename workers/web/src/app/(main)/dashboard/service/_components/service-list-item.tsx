"use client";

import { Calendar, CheckCircle2, ExternalLink, Server, Trash2 } from "lucide-react";

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

import type { Service, UpdateService } from "./schema";
import { ServiceFormDialog } from "./service-form-dialog";
import { ServicePricingLabel } from "./service-pricing-label";

type TranslateFn = (key: string, params?: Record<string, string>) => string;

function serviceVisualState(service: Service, t: TranslateFn) {
  const approvalStatus = service.approvalStatus ?? "approved";
  const isExpired = Boolean(service.expiresAt && new Date(service.expiresAt) < new Date());
  if (approvalStatus === "pending") {
    return { badgeVariant: "outline" as const, statusLabel: t("status.pending") };
  }
  if (!service.isActive) {
    return { badgeVariant: "secondary" as const, statusLabel: t("status.inactive") };
  }
  if (isExpired) {
    return { badgeVariant: "destructive" as const, statusLabel: t("status.expired") };
  }
  return { badgeVariant: "default" as const, statusLabel: t("status.active") };
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
  approvingServiceId,
  onDelete,
  onUpdate,
  onApprove,
  t,
}: {
  service: Service;
  deletingServiceId: string | number | null;
  approvingServiceId: string | number | null;
  onDelete: (serviceId: string | number) => Promise<void>;
  onUpdate: (serviceId: string | number, data: UpdateService) => Promise<Service>;
  onApprove?: (serviceId: string | number) => Promise<void>;
  t: TranslateFn;
}) {
  const serviceId = service.id;
  if (!serviceId) return null;

  const isPending = (service.approvalStatus ?? "approved") === "pending";

  return (
    <div className="flex items-center gap-1">
      {isPending && onApprove ? (
        <Button
          variant="outline"
          size="sm"
          disabled={approvingServiceId === serviceId}
          title={t("approve_service")}
          onClick={() => {
            void onApprove(serviceId);
          }}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" />
          {t("approve")}
        </Button>
      ) : null}
      <ServiceFormDialog mode="edit" service={service} onUpdate={onUpdate} />
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

export interface ServiceItemProps {
  service: Service;
  deletingServiceId: string | number | null;
  approvingServiceId?: string | number | null;
  onDelete: (serviceId: string | number) => Promise<void>;
  onUpdate: (serviceId: string | number, data: UpdateService) => Promise<Service>;
  onApprove?: (serviceId: string | number) => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  t: TranslateFn;
}

export function ServiceItem({
  service,
  deletingServiceId,
  approvingServiceId = null,
  onDelete,
  onUpdate,
  onApprove,
  formatDate,
  t,
}: ServiceItemProps) {
  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-lg p-4">
      <ServiceItemContent service={service} formatDate={formatDate} t={t} />
      <ServiceItemActions
        service={service}
        deletingServiceId={deletingServiceId}
        approvingServiceId={approvingServiceId}
        onDelete={onDelete}
        onUpdate={onUpdate}
        onApprove={onApprove}
        t={t}
      />
    </div>
  );
}
