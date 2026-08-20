"use client";

import type { ComponentType } from "react";
import { Loader2, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useNodeExecutionUi } from "../hooks/workflow-execution-ui";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";
const STOP = "bg-[#eb5262] hover:bg-[#d94558]";

export function WorkflowExecuteStepButton({
  nodeId,
  onClick,
  label,
  executingLabel,
  listeningLabel,
  listening,
  className,
  size = "default",
  icon: Icon = Play,
  fillIcon = true,
}: {
  nodeId: string;
  onClick: () => void;
  label: string;
  executingLabel?: string;
  listeningLabel?: string;
  /** When set, overrides execution-ui listening state for this node. */
  listening?: boolean;
  className?: string;
  size?: "default" | "sm";
  icon?: ComponentType<{ className?: string }>;
  fillIcon?: boolean;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const { busyForStep, workflowRunning, isListening: listeningFromUi } = useNodeExecutionUi(nodeId);
  const isListening = listening ?? listeningFromUi;
  const iconClass = size === "sm" ? "mr-1.5 size-3.5" : "mr-2 size-4";

  return (
    <Button
      type="button"
      size={size}
      disabled={workflowRunning && !isListening}
      aria-busy={busyForStep}
      className={cn(isListening ? STOP : ORANGE, "text-white", className)}
      onClick={onClick}
    >
      {busyForStep && !isListening ? (
        <Loader2 className={cn("animate-spin", iconClass)} />
      ) : (
        <Icon className={cn(iconClass, fillIcon && "fill-current")} />
      )}
      {isListening
        ? (listeningLabel ?? t("webhook_stop_listening_short"))
        : busyForStep
          ? (executingLabel ?? label)
          : label}
    </Button>
  );
}
