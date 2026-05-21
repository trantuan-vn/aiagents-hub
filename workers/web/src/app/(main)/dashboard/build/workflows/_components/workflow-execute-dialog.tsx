"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { executeWorkflow, type WorkflowExecutionResult } from "../_lib/api";

interface WorkflowExecuteDialogProps {
  workflowId: number;
  ownerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatWorkflowOutput(output: unknown): string {
  if (output == null) return "—";
  if (typeof output === "string") return output;
  if (
    typeof output === "object" &&
    "text" in output &&
    typeof (output as { text: unknown }).text === "string"
  ) {
    return (output as { text: string }).text;
  }
  return JSON.stringify(output, null, 2);
}

export function WorkflowExecuteDialog({ workflowId, ownerId, open, onOpenChange }: WorkflowExecuteDialogProps) {
  const t = useTranslations("WorkflowExecutePage");
  const [input, setInput] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorkflowExecutionResult | null>(null);

  const onRun = async () => {
    if (!workflowId) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await executeWorkflow(workflowId, {
        input: input.trim() || undefined,
        autoApproveHumanReview: autoApprove,
        ownerId,
      });
      setResult(res);
      if (res.status === "completed") toast.success(t("completed"));
      else if (res.status === "pending_human") toast.message(t("pending_human"));
      else toast.error(t("failed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,36rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label>{t("input_label")}</Label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("input_placeholder")}
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <Label htmlFor="auto-approve">{t("auto_approve")}</Label>
            <Switch id="auto-approve" checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>

          {result ? (
            <div className="overflow-hidden rounded-md border">
              <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                {t("status")}: {result.status} · {t("cost")}: {result.totalCostVnd.toLocaleString()} VND
              </p>
              <div className="max-h-56 overflow-y-auto px-3 py-3">
                <pre className="text-muted-foreground font-sans text-xs break-words whitespace-pre-wrap">
                  {formatWorkflowOutput(result.output)}
                </pre>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs">{t("steps")}</summary>
                  <pre className="mt-2 max-h-32 overflow-y-auto text-xs break-words whitespace-pre-wrap">
                    {JSON.stringify(result.steps, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button onClick={() => void onRun()} disabled={running}>
            {running ? t("running") : t("run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
