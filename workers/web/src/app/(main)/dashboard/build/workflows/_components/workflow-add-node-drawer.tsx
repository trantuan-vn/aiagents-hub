"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { WorkflowAddNodePanel } from "./workflow-add-node-panel";
import {
  useWorkflowAddNodeDrawerActions,
  useWorkflowAddNodeDrawerState,
} from "./workflow-add-node-drawer-context";

/** Warm-mount panel after idle so the first + click does not mount a heavy tree on the critical path. */
function useWarmAddNodePanel() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const warm = () => setReady(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(warm);
      return () => cancelIdleCallback(id);
    }
    const timer = window.setTimeout(warm, 300);
    return () => window.clearTimeout(timer);
  }, []);

  return ready;
}

export function WorkflowAddNodeDrawer() {
  const { isOpen, openGeneration, config } = useWorkflowAddNodeDrawerState();
  const { close } = useWorkflowAddNodeDrawerActions();
  const panelReady = useWarmAddNodePanel();

  return (
    <aside
      className={cn(
        "bg-card border-border pointer-events-none absolute inset-y-0 right-0 z-40 flex w-[min(100%,380px)] flex-col border-l shadow-lg",
        "transform-gpu transition-transform duration-300 ease-in-out will-change-transform",
        isOpen ? "pointer-events-auto translate-x-0" : "translate-x-full",
      )}
      aria-hidden={!isOpen}
      inert={!isOpen ? true : undefined}
    >
      {panelReady ? (
        <WorkflowAddNodePanel
          fillHeight
          variant={config?.variant ?? "full"}
          allowedNodeTypes={config?.allowedNodeTypes}
          resetOnOpenGeneration={openGeneration}
          className={cn(!isOpen && "pointer-events-none select-none opacity-0")}
          onPick={(pick) => {
            config?.onPick(pick);
            close();
          }}
        />
      ) : null}
    </aside>
  );
}
