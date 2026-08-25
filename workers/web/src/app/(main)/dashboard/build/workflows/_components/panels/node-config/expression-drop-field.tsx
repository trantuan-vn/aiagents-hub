"use client";

import { useCallback, useEffect, useRef, type DragEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  canAcceptExpressionDrop,
  insertExpression,
  readExpressionDrop,
  registerExpressionInsertTarget,
} from "./workflow-expression-dnd";

type ExpressionDropFieldProps = {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  showFx?: boolean;
  trailing?: ReactNode;
  /** Use text input even for numeric-looking fields so expressions can be dropped. */
  numeric?: boolean;
};

export function ExpressionDropField({
  value,
  onChange,
  multiline = false,
  rows = 4,
  placeholder,
  className,
  inputClassName,
  showFx = true,
  trailing,
  numeric = false,
}: ExpressionDropFieldProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const applyExpression = useCallback((expression: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? valueRef.current.length;
    const end = el?.selectionEnd ?? start;
    const next = insertExpression(valueRef.current, expression, start, end);
    onChangeRef.current(next);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + expression.length;
      try {
        el?.setSelectionRange(caret, caret);
      } catch {
        /* ignore non-text inputs */
      }
    });
  }, []);

  useEffect(() => {
    const target = { insert: applyExpression };
    const el = inputRef.current;
    if (!el) return;
    const onFocus = () => {
      registerExpressionInsertTarget(target);
    };
    el.addEventListener("focus", onFocus);
    let unregister = () => {};
    if (document.activeElement === el) {
      unregister = registerExpressionInsertTarget(target);
    }
    return () => {
      el.removeEventListener("focus", onFocus);
      unregister();
    };
  }, [applyExpression]);

  const applyDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const expression = readExpressionDrop(e.dataTransfer);
      if (!expression) return;
      applyExpression(expression);
    },
    [applyExpression],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    if (!canAcceptExpressionDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!canAcceptExpressionDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const shared = {
    ref: inputRef as never,
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => registerExpressionInsertTarget({ insert: applyExpression }),
    onDragEnter,
    onDragOver,
    onDrop: applyDrop,
    inputMode: numeric ? ("decimal" as const) : undefined,
    className: cn(
      "border-input bg-background ring-offset-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      showFx && "pl-8",
      multiline ? "min-h-[80px] resize-y" : "h-9",
      inputClassName,
    ),
  };

  return (
    <div className={cn("relative", className)}>
      {showFx ? (
        <span className="text-muted-foreground pointer-events-none absolute top-2 left-2 z-10 rounded border px-1 text-[9px] font-semibold">
          fx
        </span>
      ) : null}
      {multiline ? (
        <textarea {...shared} rows={rows} />
      ) : (
        <input type="text" {...shared} />
      )}
      {trailing}
    </div>
  );
}
