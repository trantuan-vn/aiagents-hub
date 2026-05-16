"use client";

import { useState } from "react";

import { Server } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import type { MemberPricingUpdate, Service, UpdateService } from "./schema";
import { ServiceItem } from "./service-list-item";

interface ServiceListProps {
  services: Service[];
  onDelete: (serviceId: string | number) => Promise<void>;
  onUpdate: (serviceId: string | number, data: UpdateService | MemberPricingUpdate) => Promise<Service>;
  canDelete?: boolean;
  isAdmin: boolean;
}

export function ServiceList({ services, onDelete, onUpdate, canDelete = false, isAdmin }: ServiceListProps) {
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
              onUpdate={onUpdate}
              formatDate={formatDate}
              t={t}
              canDelete={canDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
