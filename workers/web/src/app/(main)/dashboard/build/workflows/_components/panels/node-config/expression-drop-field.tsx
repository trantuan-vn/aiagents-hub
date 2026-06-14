"use client";

import { useCallback, useRef, type DragEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { canAcceptExpressionDrop, insertExpression, readExpressionDrop } from "./workflow-expression-dnd";

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

  const applyDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const expression = readExpressionDrop(e.dataTransfer);
      if (!expression) return;
      const el = inputRef.current;
      onChange(
        insertExpression(value, expression, el?.selectionStart, el?.selectionEnd),
      );
      requestAnimationFrame(() => el?.focus());
    },
    [onChange, value],
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
