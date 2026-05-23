"use client";
/* eslint-disable max-lines */

import { useState } from "react";

import { Calendar, Edit, Tag, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
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
import { formatUsd } from "@/lib/utils";

import { EditPolicyDialog } from "./edit-policy-dialog";
import type { PricePolicy, UpdatePricePolicy } from "./schema";

interface PolicyItemProps {
  policy: PricePolicy;
  deletingPolicyId: number | null;
  updatingStatusId: number | null;
  onDelete: (policyId: number) => Promise<void>;
  onToggleStatus: (policy: PricePolicy) => Promise<void>;
  onEdit: (policy: PricePolicy) => void;
  formatDate: (dateString: string | undefined) => string;
  getPolicyTypeLabel: (type: string) => string;
  getScopeLabel: (policy: PricePolicy) => string;
  t: (key: string, params?: Record<string, string>) => string;
}

function PolicyItemContent({
  policy,
  formatDate,
  getPolicyTypeLabel,
  getScopeLabel,
  t,
}: {
  policy: PricePolicy;
  formatDate: (dateString: string | undefined) => string;
  getPolicyTypeLabel: (type: string) => string;
  getScopeLabel: (policy: PricePolicy) => string;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const isActive = policy.status === "ACTIVE";
  const isExpired = policy.expiresAt ? new Date(policy.expiresAt) < new Date() : false;
  const badgeVariant = !isActive ? "secondary" : isExpired ? "destructive" : "default";
  const statusLabel = !isActive ? t("status.inactive") : isExpired ? t("status.expired") : t("status.active");
  const valueDisplay =
    policy.type === "PERCENTAGE" ? `${policy.value}%` : formatUsd(Number(policy.value) || 0);

  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
        <Tag className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">{policy.name}</span>
          <Badge variant={badgeVariant} className="text-xs">
            {statusLabel}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {getPolicyTypeLabel(policy.type)}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {getScopeLabel(policy)}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(policy.expiresAt)}
          </div>
          {policy.code && (
            <div className="flex items-center gap-1">
              <span className="font-mono">{policy.code}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span>{valueDisplay}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicyItemActions({
  policy,
  deletingPolicyId,
  updatingStatusId,
  onDelete,
  onToggleStatus,
  onEdit,
  t,
}: {
  policy: PricePolicy;
  deletingPolicyId: number | null;
  updatingStatusId: number | null;
  onDelete: (policyId: number) => Promise<void>;
  onToggleStatus: (policy: PricePolicy) => Promise<void>;
  onEdit: (policy: PricePolicy) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const isActive = policy.status === "ACTIVE";
  const policyId = policy.id;
  if (!policyId) return null;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onToggleStatus(policy)}
        disabled={updatingStatusId === policyId}
        title={isActive ? t("deactivate") : t("activate")}
      >
        {isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onEdit(policy)} title={t("edit")}>
        <Edit className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" disabled={deletingPolicyId === policyId} title={t("delete")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_confirm_description", { name: policy.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void onDelete(policyId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PolicyItem({
  policy,
  deletingPolicyId,
  updatingStatusId,
  onDelete,
  onToggleStatus,
  onEdit,
  formatDate,
  getPolicyTypeLabel,
  getScopeLabel,
  t,
}: PolicyItemProps) {
  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-lg p-4">
      <PolicyItemContent
        policy={policy}
        formatDate={formatDate}
        getPolicyTypeLabel={getPolicyTypeLabel}
        getScopeLabel={getScopeLabel}
        t={t}
      />
      <PolicyItemActions
        policy={policy}
        deletingPolicyId={deletingPolicyId}
        updatingStatusId={updatingStatusId}
        onDelete={onDelete}
        onToggleStatus={onToggleStatus}
        onEdit={onEdit}
        t={t}
      />
    </div>
  );
}

interface PolicyListProps {
  policies: PricePolicy[];
  onDelete: (policyId: number) => Promise<void>;
  onUpdate: (policyId: number, data: UpdatePricePolicy) => Promise<PricePolicy>;
  onUpdateStatus: (policyId: number, status: "ACTIVE" | "INACTIVE") => Promise<void>;
}

export function PolicyList({ policies, onDelete, onUpdate, onUpdateStatus }: PolicyListProps) {
  const t = useTranslations("PolicyPage");
  const { toast } = useToast();
  const [deletingPolicyId, setDeletingPolicyId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<PricePolicy | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleDelete = async (policyId: number): Promise<void> => {
    setDeletingPolicyId(policyId);
    try {
      await onDelete(policyId);
      toast({
        title: t("policy_deleted"),
        description: t("policy_deleted_description"),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("delete_error"),
        variant: "destructive",
      });
    } finally {
      setDeletingPolicyId(null);
    }
  };

  const handleToggleStatus = async (policy: PricePolicy): Promise<void> => {
    if (!policy.id) return;
    setUpdatingStatusId(policy.id);
    try {
      const newStatus = policy.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await onUpdateStatus(policy.id, newStatus);
      toast({
        title: t("status_updated"),
        description: t("status_updated_description", { status: newStatus }),
      });
    } catch (error) {
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : t("update_status_error"),
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleEdit = (policy: PricePolicy): void => {
    setEditingPolicy(policy);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async (policyId: number, data: UpdatePricePolicy): Promise<PricePolicy> => {
    return onUpdate(policyId, data);
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return t("never_expires");
    return new Date(dateString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getPolicyTypeLabel = (type: string): string => {
    switch (type) {
      case "PERCENTAGE":
        return t("type.percentage");
      case "FIXED_AMOUNT":
        return t("type.fixed_amount");
      case "TIERED":
        return t("type.tiered");
      case "USAGE_BASED":
        return t("type.usage_based");
      default:
        return type;
    }
  };

  const getScopeLabel = (policy: PricePolicy): string => {
    if (policy.applicableTo === "ALL") return t("scope.all_users");
    const ids = policy.targetIds?.length ? policy.targetIds.join(", ") : "";
    return ids ? t("scope.specific_users", { ids }) : t("scope.specific_users_empty");
  };

  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Tag className="text-muted-foreground mb-4 h-12 w-12" />
          <p className="text-muted-foreground text-center">{t("no_policies")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("policies")}</CardTitle>
            <CardDescription>{t("policies_description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {policies.map((policy) => (
              <PolicyItem
                key={policy.id}
                policy={policy}
                deletingPolicyId={deletingPolicyId}
                updatingStatusId={updatingStatusId}
                onDelete={handleDelete}
                onToggleStatus={handleToggleStatus}
                onEdit={handleEdit}
                formatDate={formatDate}
                getPolicyTypeLabel={getPolicyTypeLabel}
                getScopeLabel={getScopeLabel}
                t={t}
              />
            ))}
          </div>
        </CardContent>
      </Card>
      {editingPolicy && (
        <EditPolicyDialog
          policy={editingPolicy}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onUpdate={handleUpdate}
        />
      )}
    </>
  );
}
