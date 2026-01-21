"use client";

import { useEffect, useState } from "react";

import { AlertCircle, Tag } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { CreatePolicyDialog } from "./_components/create-policy-dialog";
import { PolicyList } from "./_components/policy-list";
import type { PricePolicy, UpdatePricePolicy } from "./_components/schema";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export default function PolicyPage() {
  const t = useTranslations("PolicyPage");
  const { toast } = useToast();
  const [policies, setPolicies] = useState<PricePolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicies = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/policy/get?limit=10&offset=0`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || t("fetch_error"));
      }

      const data: PricePolicy[] = await response.json();
      setPolicies(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("fetch_error");
      setError(errorMessage);
      toast({
        title: t("error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreatePolicy = async (data: Omit<PricePolicy, "id">): Promise<PricePolicy> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/policy/new`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("create_error"));
    }

    const result = await response.json();
    void fetchPolicies(); // Refresh the list
    return result as PricePolicy;
  };

  const handleUpdatePolicy = async (policyId: number, data: UpdatePricePolicy): Promise<PricePolicy> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/policy/${policyId}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("update_error"));
    }

    const result = await response.json();
    void fetchPolicies(); // Refresh the list
    return result as PricePolicy;
  };

  const handleDeletePolicy = async (policyId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/policy/${policyId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("delete_error"));
    }

    void fetchPolicies(); // Refresh the list
  };

  const handleUpdateStatus = async (policyId: number, status: "ACTIVE" | "INACTIVE"): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/dashboard/admin/policy/${policyId}/status`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || t("update_status_error"));
    }

    void fetchPolicies(); // Refresh the list
  };

  const activePolicies = policies.filter((p) => p.status === "ACTIVE");
  const inactivePolicies = policies.filter((p) => p.status === "INACTIVE");

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreatePolicyDialog onCreate={handleCreatePolicy} />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.total_policies")}</CardTitle>
            <Tag className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{policies.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.total_policies_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.active_policies")}</CardTitle>
            <Tag className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePolicies.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.active_policies_description")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.inactive_policies")}</CardTitle>
            <AlertCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactivePolicies.length}</div>
            <p className="text-muted-foreground text-xs">{t("stats.inactive_policies_description")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Policy List */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      ) : (
        <PolicyList
          policies={policies}
          onUpdate={handleUpdatePolicy}
          onDelete={handleDeletePolicy}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </div>
  );
}
