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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { createVoucherSchema, type CreateVoucher, type Voucher } from "./schema";

interface CreateVoucherDialogProps {
  onCreate: (data: CreateVoucher) => Promise<Voucher>;
}

export function CreateVoucherDialog({ onCreate }: CreateVoucherDialogProps) {
  const t = useTranslations("VoucherPage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateVoucher>({
    resolver: zodResolver(createVoucherSchema),
    defaultValues: {
      code: "",
      name: "",
      type: "PERCENTAGE",
      discountValue: 0,
      applicableUsers: [],
      status: "ACTIVE",
      userRoles: [],
    },
  });

  const onSubmit = async (data: CreateVoucher): Promise<void> => {
    setIsSubmitting(true);
    try {
      await onCreate(data);
      toast({
        title: t("voucher_created"),
        description: t("voucher_created_description"),
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
          {t("create_voucher")}
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("create_voucher")}</DialogTitle>
          <DialogDescription>{t("create_voucher_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.code")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("form.code_placeholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.type")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.type_placeholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">{t("form.type_percentage")}</SelectItem>
                        <SelectItem value="FIXED_AMOUNT">{t("form.type_fixed")}</SelectItem>
                        <SelectItem value="USAGE_BASED">{t("form.type_usage")}</SelectItem>
                        <SelectItem value="TIERED">{t("form.type_tiered")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="applicableUsers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.eligible_user_ids")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("form.eligible_user_ids_placeholder")}
                      value={(field.value ?? []).join(", ")}
                      onChange={(e) => {
                        const nums = e.target.value
                          .split(",")
                          .map((s) => parseInt(s.trim(), 10))
                          .filter((n) => !Number.isNaN(n));
                        field.onChange(nums.length > 0 ? nums : undefined);
                      }}
                    />
                  </FormControl>
                  <FormDescription>{t("form.eligible_user_ids_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="discountValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.discount_value")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("form.discount_value_placeholder")}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minOrderAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.min_order_amount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("form.min_order_amount_placeholder")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxDiscountAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.max_discount_amount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("form.max_discount_amount_placeholder")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="usageLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.usage_limit")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("form.usage_limit_placeholder")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormDescription>{t("form.usage_limit_description")}</FormDescription>
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.status")}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("form.status_placeholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                      <SelectItem value="INACTIVE">{t("status.inactive")}</SelectItem>
                      <SelectItem value="EXPIRED">{t("status.expired")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
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
