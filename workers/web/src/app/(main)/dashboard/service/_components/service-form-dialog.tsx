"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Control, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

import {
  createServiceSchema,
  updateServiceSchema,
  type CreateService,
  type CreateServiceFormInput,
  type Service,
  type ServiceFormValues,
  type UpdateService,
  type UpdateServiceFormInput,
} from "./schema";
import { ServiceCoreFields, ServiceModelPricingFields } from "./service-form-fields";

type FormMode = "create" | "edit";

interface ServiceFormDialogProps {
  mode: FormMode;
  service?: Service;
  onCreate?: (data: CreateService) => Promise<Service>;
  onUpdate?: (serviceId: string | number, data: UpdateService) => Promise<Service>;
  trigger?: React.ReactNode;
}

function serviceToFormValues(service: Service): UpdateServiceFormInput {
  return {
    name: service.name,
    endpoint: service.endpoint,
    expiresAt: service.expiresAt,
    isActive: service.isActive,
    model: service.model ?? "",
    priceInput: service.priceInput,
    priceOutput: service.priceOutput,
    priceInputCache: service.priceInputCache,
    feePercent: service.feePercent ?? 100,
  };
}

function CreateServiceFormDialog({ onCreate, trigger }: Pick<ServiceFormDialogProps, "onCreate" | "trigger">) {
  const t = useTranslations("ServicePage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateServiceFormInput, unknown, CreateService>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: { name: "", endpoint: "", isActive: true, model: "", feePercent: 100 },
  });

  const onSubmit = async (data: CreateService): Promise<void> => {
    if (!onCreate) return;
    setIsSubmitting(true);
    try {
      await onCreate(data);
      toast({ title: t("service_created"), description: t("service_created_description") });
      form.reset();
      setOpen(false);
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("create_error"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("create_service")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("create_service")}</DialogTitle>
          <DialogDescription>{t("create_service_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="service-form-submit" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ServiceCoreFields control={form.control as Control<ServiceFormValues>} />
            <ServiceModelPricingFields control={form.control as Control<ServiceFormValues>} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditServiceFormDialog({
  service,
  onUpdate,
  trigger,
}: Pick<ServiceFormDialogProps, "service" | "onUpdate" | "trigger">) {
  const t = useTranslations("ServicePage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<UpdateServiceFormInput, unknown, UpdateService>({
    resolver: zodResolver(updateServiceSchema),
    defaultValues: service ? serviceToFormValues(service) : {},
  });

  useEffect(() => {
    if (open && service) {
      form.reset(serviceToFormValues(service));
    }
  }, [open, service, form]);

  const onSubmit = async (data: UpdateService): Promise<void> => {
    if (!onUpdate || service?.id == null) return;
    setIsSubmitting(true);
    try {
      await onUpdate(service.id, data);
      toast({ title: t("service_updated"), description: t("service_updated_description") });
      setOpen(false);
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("update_error"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" title={t("edit_service")}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("edit_service")}</DialogTitle>
          <DialogDescription>{t("edit_service_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ServiceCoreFields control={form.control as Control<ServiceFormValues>} />
            <ServiceModelPricingFields control={form.control as Control<ServiceFormValues>} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function ServiceFormDialog({ mode, service, onCreate, onUpdate, trigger }: ServiceFormDialogProps) {
  if (mode === "create") {
    return <CreateServiceFormDialog onCreate={onCreate} trigger={trigger} />;
  }
  return <EditServiceFormDialog service={service} onUpdate={onUpdate} trigger={trigger} />;
}
