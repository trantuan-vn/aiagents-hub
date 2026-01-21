"use client";

import { useState } from "react";

import { Calendar, Gift, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import type { Voucher } from "./schema";

interface VoucherItemProps {
  voucher: Voucher;
  deletingVoucherId: string | number | null;
  onDelete: (voucherId: string | number) => Promise<void>;
  formatDate: (dateString: string | undefined) => string;
  t: (key: string, params?: Record<string, string>) => string;
}

function VoucherItemContent({
  voucher,
  formatDate,
  t,
}: {
  voucher: Voucher;
  formatDate: (dateString: string | undefined) => string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const isActive = voucher.status === "ACTIVE";
  const isExpired = voucher.expiresAt ? new Date(voucher.expiresAt) < new Date() : false;
  const badgeVariant = !isActive ? "secondary" : isExpired ? "destructive" : "default";
  const statusLabel = !isActive ? t("status.inactive") : isExpired ? t("status.expired") : t("status.active");

  const discountDisplay = voucher.type === "PERCENTAGE" ? `${voucher.discountValue}%` : `$${voucher.discountValue}`;

  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
        <Gift className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">{voucher.name}</span>
          <Badge variant={badgeVariant} className="text-xs">
            {statusLabel}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="font-mono">{voucher.code}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>{t("discount", { value: discountDisplay })}</span>
          </div>
          {voucher.usageLimit && (
            <div className="flex items-center gap-1">
              <span>
                {t("usage", {
                  used: String(voucher.usedCount || 0),
                  limit: String(voucher.usageLimit),
                })}
              </span>
            </div>
          )}
          {voucher.expiresAt && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(voucher.expiresAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VoucherItemActions({
  voucher,
  deletingVoucherId,
  onDelete,
  t,
}: {
  voucher: Voucher;
  deletingVoucherId: string | number | null;
  onDelete: (voucherId: string | number) => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const voucherId = voucher.id;
  if (!voucherId) return null;

  return (
    <div className="flex items-center gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" disabled={deletingVoucherId === voucherId} title={t("delete")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_confirm_description", { name: voucher.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onDelete(voucherId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete_voucher")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VoucherItem({ voucher, deletingVoucherId, onDelete, formatDate, t }: VoucherItemProps) {
  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-lg p-4">
      <VoucherItemContent voucher={voucher} formatDate={formatDate} t={t} />
      <VoucherItemActions voucher={voucher} deletingVoucherId={deletingVoucherId} onDelete={onDelete} t={t} />
    </div>
  );
}

interface VoucherListProps {
  vouchers: Voucher[];
  onDelete: (voucherId: string | number) => Promise<void>;
}

export function VoucherList({ vouchers, onDelete }: VoucherListProps) {
  const t = useTranslations("VoucherPage");
  const { toast } = useToast();
  const [deletingVoucherId, setDeletingVoucherId] = useState<string | number | null>(null);

  const handleDelete = async (voucherId: string | number): Promise<void> => {
    setDeletingVoucherId(voucherId);
    try {
      await onDelete(voucherId);
      toast({
        title: t("voucher_deleted"),
        description: t("voucher_deleted_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("delete_error"),
        variant: "destructive",
      });
    } finally {
      setDeletingVoucherId(null);
    }
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return t("never_expires");
    return new Date(dateString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (vouchers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Gift className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-center">{t("no_vouchers")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("vouchers")}</CardTitle>
          <CardDescription>{t("vouchers_description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {vouchers.map((voucher) => (
            <VoucherItem
              key={voucher.id}
              voucher={voucher}
              deletingVoucherId={deletingVoucherId}
              onDelete={handleDelete}
              formatDate={formatDate}
              t={t}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
