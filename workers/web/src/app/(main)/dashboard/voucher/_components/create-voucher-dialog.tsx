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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

import { CreateVoucherFormFields } from "./create-voucher-form-fields";
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
      discountPercent: 5,
      applicableTo: "ALL",
      membershipTiers: [],
      status: "ACTIVE",
    },
  });

  const applicableTo = form.watch("applicableTo");

  const onSubmit = async (data: CreateVoucher): Promise<void> => {
    setIsSubmitting(true);
    try {
      await onCreate({
        ...data,
        membershipTiers: data.applicableTo === "GROUPS" ? data.membershipTiers : undefined,
      });
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("create_voucher")}</DialogTitle>
          <DialogDescription>{t("create_voucher_description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <CreateVoucherFormFields
              form={form}
              applicableTo={applicableTo}
              isSubmitting={isSubmitting}
              onCancel={() => setOpen(false)}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
