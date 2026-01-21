"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

import { createServiceSchema, type CreateService, type Service } from "./schema";

interface CreateServiceDialogProps {
  onCreate: (data: CreateService) => Promise<Service>;
}

export function CreateServiceDialog({ onCreate }: CreateServiceDialogProps) {
  const t = useTranslations("ServicePage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateService>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      name: "",
      endpoint: "",
      maxCalls: 0,
      currentCalls: 0,
      isActive: true,
    },
  });

  const onSubmit = async (data: CreateService): Promise<void> => {
    setIsSubmitting(true);
    try {
      await onCreate(data);
      toast({
        title: t("service_created"),
        description: t("service_created_description"),
      });
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("create_service")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("create_service")}</DialogTitle>
          <DialogDescription>{t("create_service_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("form.name_placeholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endpoint"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.endpoint")}</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder={t("form.endpoint_placeholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("form.endpoint_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="maxCalls"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.max_calls")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("form.max_calls_placeholder")}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>{t("form.max_calls_description")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.expires_at")}</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        placeholder={t("form.expires_at_placeholder")}
                        {...field}
                        value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                        onChange={(e) => {
                          const value = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                          field.onChange(value);
                        }}
                      />
                    </FormControl>
                    <FormDescription>{t("form.expires_at_description")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">{t("form.is_active")}</FormLabel>
                    <FormDescription>{t("form.is_active_description")}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

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
