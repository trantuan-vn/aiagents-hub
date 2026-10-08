"use client";

import { useState, type FormEvent } from "react";

import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  memberEnterprise,
  useEnterpriseErrorMessage,
  type EnterpriseRunBody,
  type EnterpriseRunResult,
  type EnterpriseTrigger,
} from "@/lib/enterprise-api";

import { EnterpriseFormFields } from "./enterprise-form-fields";

export type RunTarget = { ownerId: string; workflowId: number; workflowName: string; trigger: EnterpriseTrigger };

type Run = (body: EnterpriseRunBody) => Promise<EnterpriseRunResult | null>;
type ChatMessage = { role: "user" | "assistant"; text: string };

function outputText(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") return output;
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    const key = ["output", "text", "answer", "response", "message"].find((k) => typeof o[k] === "string");
    if (key) return o[key] as string;
  }
  return JSON.stringify(output, null, 2);
}

/** Webhook: a JSON object goes out as `fields`, anything else as raw `input` (§5A.4). */
function webhookBody(triggerKey: string, raw: string): EnterpriseRunBody | null {
  if (!raw) return { triggerKey, fields: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { triggerKey, fields: parsed as Record<string, unknown> }
      : { triggerKey, input: raw };
  } catch {
    return null;
  }
}

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}`;
}

export function EnterpriseRunDialog({ target, onClose }: { target: RunTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] min-w-0 grid-cols-1 overflow-x-hidden overflow-y-auto sm:max-w-2xl *:min-w-0 *:max-w-full">
        {target ? (
          <RunBody key={`${target.ownerId}:${target.workflowId}:${target.trigger.triggerKey}`} target={target} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RunBody({ target }: { target: RunTarget }) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const errorMessage = useEnterpriseErrorMessage();
  const { trigger } = target;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnterpriseRunResult | null>(null);

  const run: Run = async (body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await memberEnterprise.execute(target.ownerId, target.workflowId, body);
      setResult(res);
      return res;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 wrap-anywhere">{trigger.label}</span>
          <Badge variant="outline" className="shrink-0">
            {t(`kind_${trigger.kind}`)}
          </Badge>
        </DialogTitle>
        <DialogDescription className="wrap-anywhere">{target.workflowName}</DialogDescription>
      </DialogHeader>

      {trigger.kind === "chat" ? (
        <ChatPanel trigger={trigger} busy={busy} run={run} />
      ) : (
        <InputPanel trigger={trigger} busy={busy} run={run} onInvalid={setError} />
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="wrap-anywhere break-all">{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? <RunResult result={result} showOutput={trigger.kind !== "chat"} /> : null}
    </>
  );
}

function ChatPanel({ trigger, busy, run }: { trigger: EnterpriseTrigger; busy: boolean; run: Run }) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const [text, setText] = useState("");
  const [sessionId] = useState(newSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const chatInput = text.trim();
    if (busy || !chatInput) return;
    setMessages((m) => [...m, { role: "user", text: chatInput }]);
    setText("");
    const res = await run({ triggerKey: trigger.triggerKey, chatInput, sessionId });
    if (res) setMessages((m) => [...m, { role: "assistant", text: outputText(res.output) || t("run_no_output") }]);
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="min-w-0 space-y-3">
      <div className="bg-muted/40 max-h-80 min-h-32 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto rounded-lg border p-3">
        {messages.length === 0 ? <p className="text-muted-foreground text-sm">{t("chat_empty")}</p> : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex min-w-0 justify-end" : "flex min-w-0 justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "bg-primary text-primary-foreground max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap"
                  : "bg-background max-w-[85%] min-w-0 rounded-lg border px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap"
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy ? <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" /> : null}
      </div>
      <div className="flex min-w-0 gap-2">
        <Input
          className="min-w-0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("chat_placeholder")}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

function InputPanel({
  trigger,
  busy,
  run,
  onInvalid,
}: {
  trigger: EnterpriseTrigger;
  busy: boolean;
  run: Run;
  onInvalid: (message: string) => void;
}) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  const [text, setText] = useState("");
  const [fields, setFields] = useState<Record<string, unknown>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const key = trigger.triggerKey;
    if (trigger.kind === "form") {
      await run({ triggerKey: key, fields });
      return;
    }
    if (trigger.kind === "schedule") {
      await run({ triggerKey: key, input: text });
      return;
    }
    const body = webhookBody(key, text.trim());
    if (body) await run(body);
    else onInvalid(t("run_invalid_json"));
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="min-w-0 max-w-full space-y-4">
      {trigger.kind === "form" ? (
        <EnterpriseFormFields fields={trigger.fields ?? []} values={fields} onChange={setFields} />
      ) : null}
      {trigger.kind === "webhook" ? (
        <div className="space-y-2">
          <Label>{t("webhook_body")}</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="field-sizing-fixed min-w-0 max-w-full font-mono text-xs wrap-anywhere"
            placeholder='{"message":"hello"}'
          />
        </div>
      ) : null}
      {trigger.kind === "schedule" ? (
        <div className="space-y-2">
          <Label>{t("schedule_input")}</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="field-sizing-fixed min-w-0 max-w-full wrap-anywhere"
          />
        </div>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {busy ? t("running") : t("run")}
      </Button>
    </form>
  );
}

function RunResult({ result, showOutput }: { result: EnterpriseRunResult; showOutput: boolean }) {
  const t = useTranslations("EnterpriseWorkflowsTab");
  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden rounded-lg border p-3 text-xs">
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
        <span>
          {t("run_status")}: <span className="font-medium">{result.status}</span>
        </span>
        <span className="text-muted-foreground min-w-0">
          {t("run_execution_key")}: <code className="break-all">{result.executionKey}</code>
        </span>
      </div>
      {showOutput ? (
        <pre className="bg-muted max-h-64 max-w-full min-w-0 overflow-auto rounded p-2 break-all whitespace-pre-wrap">
          {outputText(result.output) || t("run_no_output")}
        </pre>
      ) : null}
    </div>
  );
}
