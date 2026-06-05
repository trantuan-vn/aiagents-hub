"use client";

import { useCallback, useEffect, useRef } from "react";

export function useWorkflowUndo<T>(maxDepth = 40) {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const skipRecordRef = useRef(false);

  const record = useCallback(
    (snapshot: T) => {
      if (skipRecordRef.current) return;
      const stack = pastRef.current;
      const last = stack[stack.length - 1];
      if (last !== undefined && JSON.stringify(last) === JSON.stringify(snapshot)) return;
      stack.push(snapshot);
      if (stack.length > maxDepth) stack.shift();
      futureRef.current = [];
    },
    [maxDepth],
  );

  const undo = useCallback((current: T, apply: (value: T) => void): boolean => {
    const past = pastRef.current;
    if (past.length === 0) return false;
    skipRecordRef.current = true;
    futureRef.current.push(current);
    const prev = past.pop()!;
    apply(prev);
    skipRecordRef.current = false;
    return true;
  }, []);

  const redo = useCallback((current: T, apply: (value: T) => void): boolean => {
    const future = futureRef.current;
    if (future.length === 0) return false;
    skipRecordRef.current = true;
    pastRef.current.push(current);
    const next = future.pop()!;
    apply(next);
    skipRecordRef.current = false;
    return true;
  }, []);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  return { record, undo, redo, clear };
}

export function useWorkflowUndoKeyboard(
  enabled: boolean,
  onUndo: () => void,
  onRedo: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onUndo, onRedo]);
}
