"use client";

import type { ComponentProps } from "react";

import { useTranslations } from "next-intl";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

/** Fill a react-resizable-panels slot so React Flow / nested groups get a real height. */
export const workflowResizePanelClassName = "flex min-h-0 min-w-0 flex-col overflow-hidden";

export function WorkflowResizeHandle({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.PanelResizeHandle>) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="workflow-resize-handle"
      aria-label={t("resize_panels")}
      hitAreaMargins={{ coarse: 12, fine: 4 }}
      className={cn("workflow-resize-handle", className)}
      {...props}
    />
  );
}
