"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertCircle, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { ConfigCard } from "./_components/config-card";
import { getAuthFields, getBillingFields, getD1tor2Fields, getQueueFields } from "./_components/field-definitions";
import type {
  AuthWorkerConfig,
  BillingConfig,
  D1tor2CronConfig,
  QueueWorkerConfig,
  SystemConfigData,
} from "./_components/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

function parseErrorResponse(data: unknown, defaultMsg: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: string }).error;
    return typeof err === "string" ? err : defaultMsg;
  }
  return defaultMsg;
}

export default function SystemConfigPage() {
  const t = useTranslations("SystemConfigPage");
  const { toast } = useToast();
  const [config, setConfig] = useState<SystemConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/system-config`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(parseErrorResponse(errData, t("fetch_error")));
      }

      interface ApiResponse {
        data?: {
          auth_worker?: AuthWorkerConfig;
          queue_worker?: QueueWorkerConfig;
          d1tor2_cron?: D1tor2CronConfig;
          billing?: BillingConfig;
        };
      }
      const result: ApiResponse = await response.json();
      const data = result.data ?? {};
      setConfig({
        auth_worker: { ...data.auth_worker },
        queue_worker: { ...data.queue_worker },
        d1tor2_cron: { ...data.d1tor2_cron },
        billing: { ...data.billing },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("fetch_error");
      setError(msg);
      toast({ title: t("error"), description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/admin/system-config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(parseErrorResponse(errData, t("save_error")));
      }

      toast({
        title: t("saved"),
        description: t("saved_description"),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("save_error");
      setError(msg);
      toast({ title: t("error"), description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateAuth = useCallback((key: keyof AuthWorkerConfig, value: number) => {
    setConfig((prev) => (prev ? { ...prev, auth_worker: { ...prev.auth_worker, [key]: value } } : prev));
  }, []);

  const updateQueue = useCallback((key: keyof QueueWorkerConfig, value: number) => {
    setConfig((prev) => (prev ? { ...prev, queue_worker: { ...prev.queue_worker, [key]: value } } : prev));
  }, []);

  const updateD1tor2 = useCallback((key: keyof D1tor2CronConfig, value: number) => {
    setConfig((prev) => (prev ? { ...prev, d1tor2_cron: { ...prev.d1tor2_cron, [key]: value } } : prev));
  }, []);

  const updateBilling = useCallback((key: keyof BillingConfig, value: number) => {
    setConfig((prev) => (prev ? { ...prev, billing: { ...prev.billing, [key]: value } } : prev));
  }, []);

  if (isLoading || !config) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleAuthChange = (key: string, value: number) => updateAuth(key as keyof AuthWorkerConfig, value);
  const handleQueueChange = (key: string, value: number) => updateQueue(key as keyof QueueWorkerConfig, value);
  const handleD1tor2Change = (key: string, value: number) => updateD1tor2(key as keyof D1tor2CronConfig, value);
  const handleBillingChange = (key: string, value: number) => updateBilling(key as keyof BillingConfig, value);

  const authFields = getAuthFields(config).map((f) => ({ ...f, label: t(`fields.${f.key}`) }));
  const queueFields = getQueueFields(config).map((f) => ({ ...f, label: t(`fields.${f.key}`) }));
  const d1tor2Fields = getD1tor2Fields(config).map((f) => ({ ...f, label: t(`fields.${f.key}`) }));
  const billingFields = getBillingFields(config).map((f) => ({ ...f, label: t(`fields.${f.key}`) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? t("saving") : t("save_config")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("error")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
        <ConfigCard
          title={t("auth_worker")}
          description={t("auth_worker_desc")}
          fields={authFields}
          onFieldChange={handleAuthChange}
        />
        <ConfigCard
          title={t("queue_worker")}
          description={t("queue_worker_desc")}
          fields={queueFields}
          onFieldChange={handleQueueChange}
        />
        <ConfigCard
          title={t("d1tor2_worker")}
          description={t("d1tor2_worker_desc")}
          fields={d1tor2Fields}
          onFieldChange={handleD1tor2Change}
        />
        <ConfigCard
          title={t("billing")}
          description={t("billing_desc")}
          fields={billingFields}
          onFieldChange={handleBillingChange}
        />
      </div>
    </div>
  );
}
