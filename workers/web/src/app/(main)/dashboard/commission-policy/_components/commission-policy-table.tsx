"use client";

import { useState } from "react";

import { Edit, Percent, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import { formatApplicableTo } from "./commission-policy-utils";
import { EditCommissionPolicyDialog } from "./edit-commission-policy-dialog";
import { API_BASE_URL, type CommissionPolicy } from "./schema";

interface CommissionPolicyTableProps {
  policies: CommissionPolicy[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function CommissionPolicyTable({ policies, isLoading, onRefresh }: CommissionPolicyTableProps) {
  const t = useTranslations("CommissionPolicyPage");
  const { toast } = useToast();
  const [deletingPolicyId, setDeletingPolicyId] = useState<number | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<CommissionPolicy | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleDelete = async (policyId: number) => {
    setDeletingPolicyId(policyId);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/commission-policy/${policyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: t("deleted") });
      onRefresh();
    } catch (e) {
      toast({ title: t("error"), description: String(e), variant: "destructive" });
    } finally {
      setDeletingPolicyId(null);
    }
  };

  const handleEdit = (policy: CommissionPolicy) => {
    setEditingPolicy(policy);
    setIsEditDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            {t("policies")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground py-8 text-center">{t("loading")}</p>
          ) : policies.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">{t("no_policies")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("code")}</TableHead>
                  <TableHead>{t("commission_percent")}</TableHead>
                  <TableHead>{t("applicable_to")}</TableHead>
                  <TableHead>{t("effective_from")}</TableHead>
                  <TableHead>{t("effective_to")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="w-[100px]">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="font-mono">{p.code}</TableCell>
                    <TableCell>{p.commissionPercent}%</TableCell>
                    <TableCell>{formatApplicableTo(p, t)}</TableCell>
                    <TableCell>{new Date(p.effectiveFrom).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(p.effectiveTo).toLocaleDateString()}</TableCell>
                    <TableCell>{p.status}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(p)}
                          title={t("edit")}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingPolicyId === p.id}
                              title={t("delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("delete_confirm_title")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("delete_confirm_description", { name: p.name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  void handleDelete(p.id);
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editingPolicy ? (
        <EditCommissionPolicyDialog
          policy={editingPolicy}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onUpdated={onRefresh}
        />
      ) : null}
    </>
  );
}
