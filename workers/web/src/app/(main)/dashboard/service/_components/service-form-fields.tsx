"use client";

import { useTranslations } from "next-intl";
import { type Control } from "react-hook-form";

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { ServiceFormValues } from "./schema";

export { ServiceModelPricingFields } from "./service-model-pricing-fields";

interface ServiceFormFieldsProps {
  control: Control<ServiceFormValues>;
  lockNonPricing?: boolean;
}

export function ServiceCoreFields({ control, lockNonPricing = false }: ServiceFormFieldsProps) {
  const t = useTranslations("ServicePage");

  return (
    <>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("form.name")}</FormLabel>
            <FormControl>
              <Input placeholder={t("form.name_placeholder")} disabled={lockNonPricing} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="endpoint"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("form.endpoint")}</FormLabel>
            <FormControl>
              <Input type="text" placeholder={t("form.endpoint_placeholder")} disabled={lockNonPricing} {...field} />
            </FormControl>
            <FormDescription>{t("form.endpoint_description")}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name="expiresAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.expires_at")}</FormLabel>
              <FormControl>
                <Input
                  type="datetime-local"
                  disabled={lockNonPricing}
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
        control={control}
        name="isActive"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">{t("form.is_active")}</FormLabel>
              <FormDescription>{t("form.is_active_description")}</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={lockNonPricing} />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}
