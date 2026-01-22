"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";

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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { OrderItemForm } from "./order-item-form";
import { CreateOrderSchema, type CreateOrder } from "./schema";
import { VoucherSelect } from "./voucher-select";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface Service {
  id: string | number;
  name: string;
  endpoint: string;
  isActive: boolean;
}

interface Voucher {
  id: string | number;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  discountValue: number;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "USAGE_BASED" | "TIERED";
}

interface CreateOrderDialogProps {
  onCreate: (data: CreateOrder) => Promise<unknown>;
}

export function CreateOrderDialog({ onCreate }: CreateOrderDialogProps) {
  const t = useTranslations("BillingPage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isLoadingVouchers, setIsLoadingVouchers] = useState(false);

  const form = useForm<CreateOrder>({
    resolver: zodResolver(CreateOrderSchema) as Resolver<CreateOrder>,
    defaultValues: {
      items: [{ serviceId: 0, basePrice: 0, quantity: 1 }],
      currency: "VND",
      voucherCode: "",
      notes: "",
      paymentMethod: "",
    },
  });

  const handleOpenChange = (newOpen: boolean): void => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset();
    }
  };

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const fetchServices = async (): Promise<void> => {
    setIsLoadingServices(true);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/service/list`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch services");
      }

      const data: Service[] = await response.json();
      // Filter only active services
      setServices(data.filter((s) => s.isActive));
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : "Failed to load services",
        variant: "destructive",
      });
    } finally {
      setIsLoadingServices(false);
    }
  };

  const fetchVouchers = async (): Promise<void> => {
    setIsLoadingVouchers(true);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/voucher/vouchers`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch vouchers");
      }

      const data: Voucher[] = await response.json();
      // Filter only active vouchers
      setVouchers(data.filter((v) => v.status === "ACTIVE"));
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : "Failed to load vouchers",
        variant: "destructive",
      });
    } finally {
      setIsLoadingVouchers(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchServices();
      void fetchVouchers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = async (data: CreateOrder): Promise<void> => {
    setIsLoading(true);
    try {
      await onCreate(data);
      form.reset();
      setOpen(false);
      toast({
        title: t("order_created"),
        description: t("order_created_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("create_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          {t("create_order")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("create_order_title")}</DialogTitle>
          <DialogDescription>{t("create_order_description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-4">
              {fields.map((field, index) => (
                <OrderItemForm
                  key={field.id}
                  index={index}
                  control={form.control}
                  services={services}
                  isLoadingServices={isLoadingServices}
                  onRemove={() => remove(index)}
                  canRemove={fields.length > 1}
                />
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() => append({ serviceId: 0, basePrice: 0, quantity: 1 })}
                className="w-full"
                disabled={isLoadingServices || services.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("add_item")}
              </Button>
            </div>

            <VoucherSelect control={form.control} vouchers={vouchers} isLoadingVouchers={isLoadingVouchers} />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("notes")}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t("notes_placeholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("notes_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
