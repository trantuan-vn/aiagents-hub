"use client";

import type { ComponentType } from "react";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useNodeExecutionUi } from "../hooks/workflow-execution-ui";

const ORANGE = "bg-[#ff6f00] hover:bg-[#e66300]";

export function WorkflowExecuteStepButton({
  nodeId,
  onClick,
  label,
  executingLabel,
  className,
  size = "default",
  icon: Icon = Play,
  fillIcon = true,
}: {
  nodeId: string;
  onClick: () => void;
  label: string;
  executingLabel?: string;
  className?: string;
  size?: "default" | "sm";
  icon?: ComponentType<{ className?: string }>;
  fillIcon?: boolean;
}) {
  const { busyForStep, workflowRunning } = useNodeExecutionUi(nodeId);

  return (
    <Button
      type="button"
      size={size}
      disabled={workflowRunning}
      aria-busy={busyForStep}
      className={cn(ORANGE, "text-white", className)}
      onClick={onClick}
    >
      {busyForStep ? (
        <Loader2 className={cn("animate-spin", size === "sm" ? "mr-1.5 size-3.5" : "mr-2 size-4")} />
      ) : (
        <Icon className={cn(size === "sm" ? "mr-1.5 size-3.5" : "mr-2 size-4", fillIcon && "fill-current")} />
      )}
      {busyForStep ? (executingLabel ?? label) : label}
    </Button>
  );
}
