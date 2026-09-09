"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function WorkflowIoPanelPopout({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      aria-modal="false"
      className="border-border bg-background fixed inset-x-4 top-20 bottom-6 z-50 flex min-h-0 flex-col overflow-hidden rounded-lg border shadow-2xl md:inset-x-auto md:top-24 md:right-6 md:bottom-8 md:left-[22%]"
    >
      {children}
    </div>,
    document.body,
  );
}
