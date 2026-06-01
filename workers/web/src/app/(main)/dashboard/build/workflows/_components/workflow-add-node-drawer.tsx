"use client";

import { cn } from "@/lib/utils";

import { WorkflowAddNodePanel } from "./workflow-add-node-panel";
import { useWorkflowAddNodeDrawer } from "./workflow-add-node-drawer-context";

export function WorkflowAddNodeDrawer() {
  const drawer = useWorkflowAddNodeDrawer();
  if (!drawer) return null;

  const { isOpen, sessionKey, config, close } = drawer;

  return (
    <aside
      className={cn(
        "bg-card border-border pointer-events-auto absolute top-0 right-0 z-40 flex h-full w-[min(100%,380px)] flex-col border-l shadow-lg transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full pointer-events-none",
      )}
      aria-hidden={!isOpen}
    >
      {isOpen && config ? (
        <WorkflowAddNodePanel
          key={sessionKey}
          fillHeight
          variant={config.variant ?? "full"}
          allowedNodeTypes={config.allowedNodeTypes}
          onPick={(pick) => {
            config.onPick(pick);
            close();
          }}
        />
      ) : null}
    </aside>
  );
}
