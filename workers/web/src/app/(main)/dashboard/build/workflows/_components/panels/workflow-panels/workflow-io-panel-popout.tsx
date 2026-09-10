"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type PopoutRect = { left: number; top: number; width: number; height: number };

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='menuitem'], [role='menu'], [data-slot='dropdown-menu-trigger']";

function defaultPopoutRect(): PopoutRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 768) {
    const left = 16;
    const top = 80;
    return { left, top, width: vw - 32, height: Math.max(200, vh - top - 24) };
  }
  const left = Math.round(vw * 0.22);
  const top = 96;
  return {
    left,
    top,
    width: Math.max(360, vw - left - 24),
    height: Math.max(240, vh - top - 32),
  };
}

function clampRect(rect: PopoutRect): PopoutRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(rect.width, 320), Math.max(320, vw - 16));
  const height = Math.min(Math.max(rect.height, 200), Math.max(200, vh - 16));
  const minVisible = 48;
  return {
    width,
    height,
    left: Math.min(Math.max(rect.left, minVisible - width), vw - minVisible),
    top: Math.min(Math.max(rect.top, 8), vh - minVisible),
  };
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
}

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
  const [rect, setRect] = useState<PopoutRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);
  const rectRef = useRef<PopoutRect | null>(null);
  rectRef.current = rect;

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    setRect(clampRect(defaultPopoutRect()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setRect((current) => (current ? clampRect(current) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

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

  useEffect(() => {
    if (!dragging) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!open || !rect || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      aria-modal="false"
      className={cn(
        "border-border bg-background fixed z-50 flex min-h-0 flex-col overflow-hidden rounded-lg border shadow-2xl",
        dragging && "cursor-grabbing",
      )}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (isInteractiveTarget(event.target)) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const handle = target.closest("[data-workflow-io-drag-handle]");
        if (!handle || !event.currentTarget.contains(handle)) return;
        const current = rectRef.current;
        if (!current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          origLeft: current.left,
          origTop: current.top,
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        const current = rectRef.current;
        if (!drag || !current || drag.pointerId !== event.pointerId) return;
        setRect(
          clampRect({
            ...current,
            left: drag.origLeft + (event.clientX - drag.startX),
            top: drag.origTop + (event.clientY - drag.startY),
          }),
        );
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
    </div>,
    document.body,
  );
}
