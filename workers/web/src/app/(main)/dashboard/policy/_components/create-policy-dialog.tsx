"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";

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

import { createPricePolicySchema, type CreatePricePolicy, type PricePolicy } from "./schema";

interface CreatePolicyDialogProps {
  onCreate: (data: CreatePricePolicy) => Promise<PricePolicy>;
}

export function CreatePolicyDialog({ onCreate }: CreatePolicyDialogProps) {
  const t = useTranslations("PolicyPage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreatePricePolicy>({
    resolver: zodResolver(createPricePolicySchema),
    defaultValues: {
      name: "",
      code: "",
      type: "PERCENTAGE",
      value: 0,
      applicableTo: "ALL",
      targetIds: [],
      priority: 0,
      status: "ACTIVE",
    },
  });

  const applicableTo = useWatch({ control: form.control, name: "applicableTo" });

  const onSubmit = async (data: CreatePricePolicy): Promise<void> => {
    setIsSubmitting(true);
    try {
      await onCreate(data);
      toast({
        title: t("policy_created"),
        description: t("policy_created_description"),
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
          {t("create_policy")}
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("create_policy")}</DialogTitle>
          <DialogDescription>{t("create_policy_description")}</DialogDescription>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            </div>

            {applicableTo === "SPECIFIC" ? (
              <FormField
                control={form.control}
                name="targetIds"
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
                          field.onChange(nums.length > 0 ? nums : []);
                        }}
                      />
                    </FormControl>
                    <FormDescription>{t("form.eligible_user_ids_description")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
