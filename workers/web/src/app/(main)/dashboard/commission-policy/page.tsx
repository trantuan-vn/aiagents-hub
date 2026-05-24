"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { CommissionPolicyTable } from "./_components/commission-policy-table";
import { normalizePolicy } from "./_components/commission-policy-utils";
import { CreateCommissionPolicyDialog } from "./_components/create-commission-policy-dialog";
import { API_BASE_URL, type CommissionPolicy } from "./_components/schema";

export default function CommissionPolicyPage() {
  const t = useTranslations("CommissionPolicyPage");
  const [policies, setPolicies] = useState<CommissionPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/admin/commission-policy/get`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setPolicies(
          Array.isArray(data) ? data.map((row) => normalizePolicy(row as Record<string, unknown>)) : [],
        );
      }
    } catch {
      setPolicies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolicies();
  }, [fetchPolicies]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <CreateCommissionPolicyDialog onCreated={() => void fetchPolicies()} />
      </div>

      <CommissionPolicyTable policies={policies} isLoading={isLoading} onRefresh={() => void fetchPolicies()} />
    </div>
  );
}
