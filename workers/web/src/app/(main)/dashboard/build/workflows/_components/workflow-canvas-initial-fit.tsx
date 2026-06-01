"use client";

import { useEffect } from "react";

import { useReactFlow } from "@xyflow/react";

const FIT_VIEW_OPTIONS = { padding: 0.2, duration: 0 } as const;

let didInitialFit = false;

/** One-time fit after React Flow init — no store subscription (avoids extra React Flow repaints). */
export function WorkflowCanvasInitialFit({ enabled }: { enabled: boolean }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!enabled || didInitialFit) return;

    const frame = requestAnimationFrame(() => {
      void fitView(FIT_VIEW_OPTIONS);
      didInitialFit = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [enabled, fitView]);

  return null;
}
