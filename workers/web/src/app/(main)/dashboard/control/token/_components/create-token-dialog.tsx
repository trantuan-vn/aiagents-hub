"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Key, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { createApiTokenSchema, type CreateApiToken } from "./schema";

interface CreateTokenResponse {
  apiToken: { id: number; name: string; permissions: string[]; expiresAt?: string; createdAt: string };
  rawToken: string;
}

interface CreateTokenDialogProps {
  onCreate: (data: CreateApiToken) => Promise<CreateTokenResponse>;
}

export function CreateTokenDialog({ onCreate }: CreateTokenDialogProps) {
  const t = useTranslations("TokenPage");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const form = useForm<CreateApiToken>({
    resolver: zodResolver(createApiTokenSchema) as Resolver<CreateApiToken>,
    defaultValues: {
      name: "",
      permissions: [],
      expiresInDays: 30,
    },
  });

  const onSubmit = async (data: CreateApiToken): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await onCreate(data);
      setCreatedToken(result.rawToken);
      form.reset();
      toast({
        title: t("token_created"),
        description: t("token_created_description"),
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

  const copyToken = (): void => {
    if (createdToken) {
      void navigator.clipboard.writeText(createdToken);
      toast({
        title: t("token_copied"),
        description: t("token_copied_description"),
      });
    }
  };

  const handleClose = (): void => {
    setOpen(false);
    setCreatedToken(null);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          {t("create_token")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("create_token_title")}</DialogTitle>
          <DialogDescription>{t("create_token_description")}</DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-4 w-4" />
                <span className="text-sm font-medium">{t("your_token")}</span>
              </div>
              <p className="text-muted-foreground text-xs mb-3">{t("token_warning")}</p>
              <div className="bg-background rounded border p-3 font-mono text-sm break-all">
                {createdToken}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyToken} className="flex-1">
                <Key className="mr-1 h-4 w-4" />
                {t("copy_token")}
              </Button>
              <Button variant="outline" onClick={handleClose} className="flex-1">
                {t("done")}
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("token_name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("token_name_placeholder")} {...field} />
                    </FormControl>
                    <FormDescription>{t("token_name_description")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresInDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("expires_in_days")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        placeholder="30"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                      />
                    </FormControl>
                    <FormDescription>{t("expires_in_days_description")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? t("creating") : t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
