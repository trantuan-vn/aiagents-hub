"use client";

import { Calendar, Key, Shield } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ApiToken } from "./schema";

type TokenDetailDialogProps = {
  token: ApiToken | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TokenDetailDialog({ token, open, onOpenChange }: TokenDetailDialogProps) {
  const t = useTranslations("TokenPage");
  if (!token) return null;

  const expired = token.expiresAt ? new Date(token.expiresAt) < new Date() : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-4" />
            {token.name}
          </DialogTitle>
          <DialogDescription>{t("token_detail_description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={!token.isActive ? "secondary" : expired ? "destructive" : "default"}>
              {!token.isActive ? t("inactive") : expired ? t("expired") : t("active")}
            </Badge>
            <span className="text-muted-foreground font-mono text-xs">ID: {token.id}</span>
          </div>

          <div className="bg-muted/40 rounded-md border px-3 py-2 font-mono text-xs">
            utk_••••••••••••••••••••••••••••••••
            <p className="text-muted-foreground mt-1 font-sans text-[11px]">{t("token_secret_hidden")}</p>
          </div>

          <div className="grid gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Calendar className="text-muted-foreground size-3.5" />
              <span className="text-muted-foreground">{t("token_created_at")}:</span>
              <span>{new Date(token.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="text-muted-foreground size-3.5" />
              <span className="text-muted-foreground">{t("expires_in_days")}:</span>
              <span>{token.expiresAt ? new Date(token.expiresAt).toLocaleString() : t("never_expires")}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <Shield className="text-muted-foreground size-3.5" />
              <span className="font-medium">
                {t("permissions_label")} ({token.permissions.length})
              </span>
            </div>
            {token.permissions.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t("token_no_permissions")}</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {token.permissions.map((perm) => (
                  <div key={perm} className="bg-muted/30 rounded px-2 py-1.5 font-mono text-[11px] break-all">
                    {perm}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
