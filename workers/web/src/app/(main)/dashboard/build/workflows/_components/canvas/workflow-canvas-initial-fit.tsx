"use client";

import { useEffect, useRef } from "react";

import { useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";

export const WORKFLOW_FIT_VIEW_OPTIONS = { padding: 0.2, duration: 200, minZoom: 0.2 } as const;

const MIN_PANE_PX = 32;
const LAYOUT_IDLE_MS = 80;
const MAX_ATTEMPTS = 16;

function hasUsableBounds(bounds: { width: number; height: number }) {
  return Number.isFinite(bounds.width) && Number.isFinite(bounds.height) && bounds.width > 0 && bounds.height > 0;
}

/** Fit after the graph, viewport, and surrounding chrome have finished laying out. */
export function WorkflowCanvasInitialFit({
  enabled,
  resetKey,
}: {
  enabled: boolean;
  resetKey?: number | string;
}) {
  const rf = useReactFlow();
  const rfRef = useRef(rf);
  rfRef.current = rf;
  const nodesInitialized = useNodesInitialized();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const didFitRef = useRef(false);
  const lastResetKeyRef = useRef(resetKey);

  if (lastResetKeyRef.current !== resetKey) {
    lastResetKeyRef.current = resetKey;
    didFitRef.current = false;
  }

  const paneReady = width >= MIN_PANE_PX && height >= MIN_PANE_PX;
  const viewportInitialized = rf.viewportInitialized;

  useEffect(() => {
    if (!enabled || !paneReady || !viewportInitialized || didFitRef.current) return;

    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const tryFit = () => {
      if (cancelled || didFitRef.current) return;
      const { getNodes, getNodesBounds, fitBounds, fitView } = rfRef.current;
      const nodes = getNodes();
      if (nodes.length === 0) return;

      const bounds = getNodesBounds(nodes);
      if (hasUsableBounds(bounds)) {
        didFitRef.current = true;
        void fitBounds(bounds, { padding: 0.2, duration: 200 });
        return;
      }

      if (nodesInitialized) {
        didFitRef.current = true;
        void fitView(WORKFLOW_FIT_VIEW_OPTIONS);
        return;
      }

      if (attempts < MAX_ATTEMPTS) {
        attempts += 1;
        retryTimer = setTimeout(tryFit, LAYOUT_IDLE_MS);
      }
    };

    retryTimer = setTimeout(tryFit, LAYOUT_IDLE_MS);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [enabled, paneReady, viewportInitialized, nodesInitialized, resetKey]);

  return null;
}
