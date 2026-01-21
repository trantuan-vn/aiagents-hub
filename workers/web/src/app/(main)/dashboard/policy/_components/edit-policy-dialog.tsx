"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
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
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { updatePricePolicySchema, type PricePolicy, type UpdatePricePolicy } from "./schema";

interface EditPolicyDialogProps {
  policy: PricePolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (policyId: number, data: UpdatePricePolicy) => Promise<PricePolicy>;
}

export function EditPolicyDialog({ policy, open, onOpenChange, onUpdate }: EditPolicyDialogProps) {
  const t = useTranslations("PolicyPage");
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<UpdatePricePolicy>({
    resolver: zodResolver(updatePricePolicySchema),
    defaultValues: {
      name: policy.name,
      code: policy.code,
      type: policy.type,
      value: policy.value,
      applicableTo: policy.applicableTo,
      targetType: policy.targetType,
      targetIds: policy.targetIds ?? [],
      priority: policy.priority,
      status: policy.status,
      expiresAt: policy.expiresAt,
    },
  });

  // Reset form when policy changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: policy.name,
        code: policy.code,
        type: policy.type,
        value: policy.value,
        applicableTo: policy.applicableTo,
        targetType: policy.targetType,
        targetIds: policy.targetIds ?? [],
        priority: policy.priority,
        status: policy.status,
        expiresAt: policy.expiresAt,
      });
    }
  }, [open, policy, form]);

  const onSubmit = async (data: UpdatePricePolicy): Promise<void> => {
    if (!policy.id) return;

    setIsSubmitting(true);
    try {
      await onUpdate(policy.id, data);
      toast({
        title: t("policy_updated"),
        description: t("policy_updated_description"),
      });
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("edit_policy")}</DialogTitle>
          <DialogDescription>{t("edit_policy_description")}</DialogDescription>
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
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.code")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("form.code_placeholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("form.code_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.type_placeholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">{t("type.percentage")}</SelectItem>
                        <SelectItem value="FIXED_AMOUNT">{t("type.fixed_amount")}</SelectItem>
                        <SelectItem value="TIERED">{t("type.tiered")}</SelectItem>
                        <SelectItem value="USAGE_BASED">{t("type.usage_based")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.value")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder={t("form.value_placeholder")}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        value={field.value}
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
                name="applicableTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.applicable_to")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.applicable_to_placeholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ALL">{t("form.all")}</SelectItem>
                        <SelectItem value="SPECIFIC">{t("form.specific")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.target_type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.target_type_placeholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SERVICE">{t("target.service")}</SelectItem>
                        <SelectItem value="USER">{t("target.user")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.priority")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder={t("form.priority_placeholder")}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      value={field.value}
                    />
                  </FormControl>
                  <FormDescription>{t("form.priority_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("form.status")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("form.status_placeholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                      <SelectItem value="INACTIVE">{t("status.inactive")}</SelectItem>
                    </SelectContent>
                  </Select>
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
                      {...field}
                      value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value ? new Date(value).toISOString() : undefined);
                      }}
                    />
                  </FormControl>
                  <FormDescription>{t("form.expires_at_description")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("updating") : t("update")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
