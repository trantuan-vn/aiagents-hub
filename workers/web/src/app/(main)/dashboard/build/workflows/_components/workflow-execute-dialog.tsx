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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { executeWorkflow, type WorkflowExecutionResult } from "../_lib/api";

interface WorkflowExecuteDialogProps {
  workflowId: number;
  ownerId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <ScrollArea className="max-h-48 rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">
                {t("status")}: {result.status} · {t("cost")}: {result.totalCostVnd.toLocaleString()} VND
              </p>
              <pre className="text-muted-foreground text-xs whitespace-pre-wrap">
                {JSON.stringify(result.output, null, 2)}
              </pre>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">{t("steps")}</summary>
                <pre className="mt-1 text-xs">{JSON.stringify(result.steps, null, 2)}</pre>
              </details>
            </ScrollArea>
          ) : null}
        </div>

        <DialogFooter>
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
