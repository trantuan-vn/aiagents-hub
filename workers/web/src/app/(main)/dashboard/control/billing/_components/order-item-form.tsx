"use client";

import { useTranslations } from "next-intl";
import { Control } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { CreateOrder } from "./schema";

interface Service {
  id: string | number;
  name: string;
  endpoint: string;
  isActive: boolean;
}

interface OrderItemFormProps {
  index: number;
  control: Control<CreateOrder>;
  services: Service[];
  isLoadingServices: boolean;
  onRemove: () => void;
  canRemove: boolean;
}

export function OrderItemForm({
  index,
  control,
  services,
  isLoadingServices,
  onRemove,
  canRemove,
}: OrderItemFormProps) {
  const t = useTranslations("BillingPage");

  return (
    <div className="bg-muted space-y-3 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {t("item")} {index + 1}
        </h4>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            {t("remove")}
          </Button>
        )}
      </div>

      <FormField
        control={control}
        name={`items.${index}.serviceId`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("service")}</FormLabel>
            <Select
              onValueChange={(value) => field.onChange(parseInt(value, 10))}
              value={field.value ? String(field.value) : ""}
              disabled={isLoadingServices}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingServices ? t("loading") : t("select_service")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {services.length === 0 && !isLoadingServices ? (
                  <SelectItem value="__no_services__" disabled>
                    {t("no_services_available")}
                  </SelectItem>
                ) : (
                  services.map((service) => (
                    <SelectItem key={service.id} value={String(service.id)}>
                      {service.name} {service.endpoint && `(${service.endpoint})`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <FormDescription>{t("service_description")}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name={`items.${index}.basePrice`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("base_price")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={`items.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("quantity")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  placeholder="1"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
