"use client";

import { useCallback, useEffect, useState } from "react";

import { Clock, Copy, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  createWorkflowCredential,
  createWorkflowTrigger,
  deleteWorkflowCredential,
  deleteWorkflowTrigger,
  listWorkflowCredentials,
  listWorkflowTriggers,
  updateWorkflowTrigger,
  type WorkflowCredential,
  type WorkflowCredentialType,
  type WorkflowTrigger,
} from "../../../_lib/api";

const CRED_TYPES: WorkflowCredentialType[] = ["bearer", "header", "basic", "query", "none"];

interface WorkflowTriggersPanelProps {
  workflowId: number;
}

export function WorkflowTriggersPanel({ workflowId }: WorkflowTriggersPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [credentials, setCredentials] = useState<WorkflowCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Create-trigger form
  const [cronExpr, setCronExpr] = useState("*/15 * * * *");
  const [triggerInput, setTriggerInput] = useState("");
  const [autoApprove, setAutoApprove] = useState(true);

  // Create-credential form
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState<WorkflowCredentialType>("bearer");
  const [credSecret, setCredSecret] = useState("");
  const [credHeaderName, setCredHeaderName] = useState("");
  const [credParamName, setCredParamName] = useState("");
  const [credUsername, setCredUsername] = useState("");

  const load = useCallback(async () => {
    if (!workflowId || isNaN(workflowId)) return;
    setLoading(true);
    try {
      const [{ triggers: tg }, { credentials: cr }] = await Promise.all([
        listWorkflowTriggers(workflowId),
        listWorkflowCredentials(),
      ]);
      setTriggers(tg);
      setCredentials(cr);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTrigger = async (type: WorkflowTrigger["type"]) => {
    setBusy(true);
    try {
      await createWorkflowTrigger(workflowId, {
        type,
        cronExpr: type === "cron" ? cronExpr.trim() : undefined,
        input: triggerInput.trim() || undefined,
        autoApproveHumanReview: autoApprove,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create trigger");
    } finally {
      setBusy(false);
    }
  };

  const toggleTrigger = async (trigger: WorkflowTrigger) => {
    try {
      await updateWorkflowTrigger(trigger.triggerId, { enabled: trigger.enabled !== 1 });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update trigger");
    }
  };

  const removeTrigger = async (triggerId: string) => {
    try {
      await deleteWorkflowTrigger(triggerId);
      setTriggers((prev) => prev.filter((x) => x.triggerId !== triggerId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete trigger");
    }
  };

  const copyUrl = async (url?: string) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success(t("triggers_copied"));
  };

  const addCredential = async () => {
    if (!credName.trim()) return;
    setBusy(true);
    try {
      await createWorkflowCredential({
        name: credName.trim(),
        type: credType,
        secret: credSecret || undefined,
        meta: {
          headerName: credHeaderName || undefined,
          paramName: credParamName || undefined,
          username: credUsername || undefined,
        },
      });
      setCredName("");
      setCredSecret("");
      setCredHeaderName("");
      setCredParamName("");
      setCredUsername("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create credential");
    } finally {
      setBusy(false);
    }
  };

  const removeCredential = async (id: number) => {
    try {
      await deleteWorkflowCredential(id);
      setCredentials((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete credential");
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto">
      {/* Triggers */}
      <section className="border-b p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{t("triggers_title")}</h2>
            <p className="text-muted-foreground text-xs">{t("triggers_description")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("triggers_refresh")}
          </Button>
        </div>

        {/* Create form */}
        <div className="bg-muted/30 mb-4 space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-2">
            <Label htmlFor="trg-auto" className="text-xs">
              {t("triggers_auto_approve")}
            </Label>
            <Switch id="trg-auto" checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>
          <Input
            value={triggerInput}
            onChange={(e) => setTriggerInput(e.target.value)}
            placeholder={t("triggers_input_placeholder")}
            className="text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder={t("triggers_cron_placeholder")}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button size="sm" disabled={busy} onClick={() => void addTrigger("cron")}>
              <Clock className="size-3.5" />
              {t("triggers_add_cron")}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void addTrigger("webhook")}>
              <Webhook className="size-3.5" />
              {t("triggers_add_webhook")}
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">{t("triggers_channels_hint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void addTrigger("telegram")}>
              {t("triggers_add_telegram")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void addTrigger("slack")}>
              {t("triggers_add_slack")}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void addTrigger("discord")}>
              {t("triggers_add_discord")}
            </Button>
          </div>
        </div>

        {/* List */}
        {triggers.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("triggers_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {triggers.map((trg) => (
              <li key={trg.triggerId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        {trg.type === "cron" ? <Clock className="size-3" /> : <Webhook className="size-3" />}
                        {trg.type}
                      </Badge>
                      {trg.type === "cron" ? (
                        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
                          {trg.cronExpr}
                        </code>
                      ) : null}
                    </div>
                    {trg.type === "webhook" && trg.webhookPath ? (
                      <p className="text-muted-foreground font-mono text-[11px]">
                        path: {trg.webhookPath}
                        {trg.nodeId ? ` · node: ${trg.nodeId}` : ""}
                      </p>
                    ) : null}
                    {trg.webhookUrl ? (
                      <div className="flex items-center gap-1">
                        <code className="text-muted-foreground max-w-[22rem] truncate font-mono text-[11px]">
                          {trg.webhookUrl}
                        </code>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            void copyUrl(trg.webhookUrl);
                            if (trg.type !== "webhook") toast.success(t("triggers_channel_copied"));
                          }}
                          title={t("triggers_copy_url")}
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                    ) : null}
                    <p className="text-muted-foreground text-[11px]">
                      {t("triggers_last_run")}:{" "}
                      {trg.lastRunAt ? new Date(trg.lastRunAt).toLocaleString() : t("triggers_never")}
                      {trg.lastStatus ? ` · ${trg.lastStatus}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={trg.enabled === 1}
                      onCheckedChange={() => void toggleTrigger(trg)}
                    />
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void removeTrigger(trg.triggerId)}
                      title={t("triggers_delete")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Credentials */}
      <section className="p-4">
        <h2 className="text-sm font-semibold">{t("creds_title")}</h2>
        <p className="text-muted-foreground mb-3 text-xs">{t("creds_description")}</p>

        <div className="bg-muted/30 mb-4 space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
              placeholder={t("creds_name")}
              className="h-8 flex-1 text-xs"
            />
            <select
              value={credType}
              onChange={(e) => setCredType(e.target.value as WorkflowCredentialType)}
              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            >
              {CRED_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {ct}
                </option>
              ))}
            </select>
          </div>
          {credType !== "none" ? (
            <Input
              type="password"
              value={credSecret}
              onChange={(e) => setCredSecret(e.target.value)}
              placeholder={t("creds_secret")}
              className="h-8 text-xs"
            />
          ) : null}
          {credType === "header" ? (
            <Input
              value={credHeaderName}
              onChange={(e) => setCredHeaderName(e.target.value)}
              placeholder={t("creds_header_name")}
              className="h-8 text-xs"
            />
          ) : null}
          {credType === "query" ? (
            <Input
              value={credParamName}
              onChange={(e) => setCredParamName(e.target.value)}
              placeholder={t("creds_param_name")}
              className="h-8 text-xs"
            />
          ) : null}
          {credType === "basic" ? (
            <Input
              value={credUsername}
              onChange={(e) => setCredUsername(e.target.value)}
              placeholder={t("creds_username")}
              className="h-8 text-xs"
            />
          ) : null}
          <Button size="sm" disabled={busy || !credName.trim()} onClick={() => void addCredential()}>
            <Plus className="size-3.5" />
            {t("creds_create")}
          </Button>
        </div>

        {credentials.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("creds_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {credentials.map((cred) => (
              <li key={cred.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {cred.type}
                  </Badge>
                  <span className="text-sm">{cred.name}</span>
                  <code className="text-muted-foreground font-mono text-[10px]">{cred.credentialKey.slice(0, 8)}</code>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void removeCredential(cred.id)}
                  title={t("creds_delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
