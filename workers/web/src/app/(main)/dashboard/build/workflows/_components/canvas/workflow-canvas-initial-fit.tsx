"use client";

import { useEffect, useRef } from "react";

import { useNodesInitialized, useReactFlow } from "@xyflow/react";

export const WORKFLOW_FIT_VIEW_OPTIONS = { padding: 0.2, duration: 200 } as const;

/** Fit once the graph and viewport are ready — each time the editor canvas mounts. */
export function WorkflowCanvasInitialFit({
  enabled,
  resetKey,
}: {
  enabled: boolean;
  resetKey?: number | string;
}) {
  const { fitView, viewportInitialized } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const didFitRef = useRef(false);
  const lastResetKeyRef = useRef(resetKey);

  if (lastResetKeyRef.current !== resetKey) {
    lastResetKeyRef.current = resetKey;
    didFitRef.current = false;
  }

  useEffect(() => {
    if (!enabled || !nodesInitialized || !viewportInitialized || didFitRef.current) return;

    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let innerFrame = 0;

    const tryFit = () => {
      if (cancelled || didFitRef.current) return;
      void Promise.resolve(fitView(WORKFLOW_FIT_VIEW_OPTIONS)).then((fitted) => {
        if (cancelled) return;
        if (fitted) {
          didFitRef.current = true;
          return;
        }
        if (attempts < 8) {
          attempts += 1;
          retryTimer = setTimeout(tryFit, 50);
        }
      });
    };

    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(tryFit);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [enabled, nodesInitialized, viewportInitialized, fitView, resetKey]);

  return null;
}
