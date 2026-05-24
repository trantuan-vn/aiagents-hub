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
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

import { CommissionPolicyFormFields } from "./commission-policy-form-fields";
import { API_BASE_URL, commissionPolicyFormSchema, type CommissionPolicyFormValues } from "./schema";

interface CreateCommissionPolicyDialogProps {
  onCreated: () => void;
}

export function CreateCommissionPolicyDialog({ onCreated }: CreateCommissionPolicyDialogProps) {
  const t = useTranslations("CommissionPolicyPage");
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CommissionPolicyFormValues>({
    resolver: zodResolver(commissionPolicyFormSchema),
    defaultValues: {
      name: "",
      code: "",
      commissionPercent: 10,
      applicableTo: "ALL",
      membershipTiers: [],
      effectiveFrom: new Date().toISOString().slice(0, 16),
      effectiveTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      priority: 0,
      status: "ACTIVE",
    },
  });

  const applicableTo = useWatch({ control: form.control, name: "applicableTo" });

  const onSubmit = async (data: CommissionPolicyFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        membershipTiers: data.applicableTo === "USER_GROUP" ? data.membershipTiers : undefined,
        effectiveFrom: new Date(data.effectiveFrom).toISOString(),
        effectiveTo: new Date(data.effectiveTo).toISOString(),
      };
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/commission-policy/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: t("created") });
      form.reset();
      setDialogOpen(false);
      onCreated();
    } catch (e) {
      toast({ title: t("error"), description: String(e), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("create")}</DialogTitle>
          <DialogDescription>{t("create_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <CommissionPolicyFormFields form={form} applicableTo={applicableTo} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
