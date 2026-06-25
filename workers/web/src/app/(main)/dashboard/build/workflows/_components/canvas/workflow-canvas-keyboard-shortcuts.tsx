"use client";

import { useEffect } from "react";

import { useWorkflowCanvasUi } from "./workflow-canvas-ui-context";

export function WorkflowCanvasKeyboardShortcuts({ enabled }: { enabled?: boolean }) {
  const ui = useWorkflowCanvasUi();

  useEffect(() => {
    if (!enabled || !ui || ui.readOnly) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "a") {
        event.preventDefault();
        ui.selectAll?.();
        return;
      }

      if (key === "g" && event.shiftKey) {
        event.preventDefault();
        ui.ungroupSelected?.();
        return;
      }

      if (key === "g") {
        event.preventDefault();
        ui.groupSelected?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, ui]);

  return null;
}
