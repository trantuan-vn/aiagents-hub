"use client";

import { useCallback, useEffect } from "react";

import { useReactFlow } from "@xyflow/react";

import { WorkflowCanvasControls } from "./workflow-canvas-controls";

interface WorkflowCanvasTidyBridgeProps {
  readOnly?: boolean;
  tidyLayout: () => void;
  onTidyWithFitReady: (fn: (() => void) | undefined) => void;
}

/** Registers tidy + fit-view and renders canvas controls (must be inside ReactFlow). */
export function WorkflowCanvasTidyBridge({
  readOnly,
  tidyLayout,
  onTidyWithFitReady,
}: WorkflowCanvasTidyBridgeProps) {
  const { fitView } = useReactFlow();

  const tidyWithFit = useCallback(() => {
    tidyLayout();
    window.setTimeout(() => {
      void fitView({ padding: 0.2, duration: 250 });
    }, 50);
  }, [tidyLayout, fitView]);

  useEffect(() => {
    onTidyWithFitReady(readOnly ? undefined : tidyWithFit);
    return () => onTidyWithFitReady(undefined);
  }, [readOnly, tidyWithFit, onTidyWithFitReady]);

  return <WorkflowCanvasControls readOnly={readOnly} onTidy={readOnly ? undefined : tidyWithFit} />;
}
