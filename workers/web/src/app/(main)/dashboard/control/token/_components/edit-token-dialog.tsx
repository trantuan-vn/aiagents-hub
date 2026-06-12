"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { PermissionSelector, type PermissionGroup } from "./permission-selector";
import type { ApiToken } from "./schema";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

const editTokenFormSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).min(1),
});

type EditTokenForm = z.infer<typeof editTokenFormSchema>;

type EditTokenDialogProps = {
  token: ApiToken | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => Promise<void>;
};

export function EditTokenDialog({ token, open, onOpenChange, onUpdated }: EditTokenDialogProps) {
  const t = useTranslations("TokenPage");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);

  const form = useForm<EditTokenForm>({
    resolver: zodResolver(editTokenFormSchema) as Resolver<EditTokenForm>,
    defaultValues: { name: "", permissions: [] },
  });

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/token/permissions`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error("fetch permissions failed");
        const data = (await res.json()) as { groups?: PermissionGroup[] };
        setPermissionGroups(data.groups ?? []);
      } catch {
        setPermissionGroups([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!token || !open) return;
    form.reset({
      name: token.name,
      permissions: token.permissions ?? [],
    });
  }, [token, open, form]);

  const onSubmit = async (data: EditTokenForm): Promise<void> => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/token/${token.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || t("update_error"));
      }
      toast({ title: t("token_updated"), description: t("token_updated_description") });
      onOpenChange(false);
      await onUpdated();
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("update_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            {t("edit_token_title")}
          </DialogTitle>
          <DialogDescription>{t("edit_token_description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("token_name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("permissions_label")}</FormLabel>
                  <PermissionSelector
                    groups={permissionGroups}
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
