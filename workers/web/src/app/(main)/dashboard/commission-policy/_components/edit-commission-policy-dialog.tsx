"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
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
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

import { CommissionPolicyFormFields } from "./commission-policy-form-fields";
import { toDatetimeLocal } from "./commission-policy-utils";
import {
  API_BASE_URL,
  commissionPolicyFormSchema,
  type CommissionPolicy,
  type CommissionPolicyFormValues,
} from "./schema";

interface EditCommissionPolicyDialogProps {
  policy: CommissionPolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

function policyToFormValues(policy: CommissionPolicy): CommissionPolicyFormValues {
  return {
    name: policy.name,
    code: policy.code,
    commissionPercent: policy.commissionPercent,
    applicableTo: policy.applicableTo === "USER_GROUP" ? "USER_GROUP" : "ALL",
    membershipTiers: policy.membershipTiers ?? [],
    effectiveFrom: toDatetimeLocal(policy.effectiveFrom),
    effectiveTo: toDatetimeLocal(policy.effectiveTo),
    priority: policy.priority,
    status: policy.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

export function EditCommissionPolicyDialog({
  policy,
  open,
  onOpenChange,
  onUpdated,
}: EditCommissionPolicyDialogProps) {
  const t = useTranslations("CommissionPolicyPage");
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CommissionPolicyFormValues>({
    resolver: zodResolver(commissionPolicyFormSchema),
    defaultValues: policyToFormValues(policy),
  });

  const applicableTo = useWatch({ control: form.control, name: "applicableTo" });

  useEffect(() => {
    if (open) {
      form.reset(policyToFormValues(policy));
    }
  }, [open, policy, form]);

  const onSubmit = async (data: CommissionPolicyFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        membershipTiers: data.applicableTo === "USER_GROUP" ? data.membershipTiers : undefined,
        effectiveFrom: new Date(data.effectiveFrom).toISOString(),
        effectiveTo: new Date(data.effectiveTo).toISOString(),
      };
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/commission-policy/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: t("updated") });
      onOpenChange(false);
      onUpdated();
    } catch (e) {
      toast({ title: t("error"), description: String(e), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
          <DialogDescription>{t("edit_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <CommissionPolicyFormFields form={form} applicableTo={applicableTo} codeDisabled />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t("updating") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
