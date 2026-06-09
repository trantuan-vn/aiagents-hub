"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function highlightJson(source: string): string {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, quoted, colon) => {
      if (quoted) {
        if (colon) {
          return `<span class="text-[#881391]">${quoted}</span>${colon}`;
        }
        return `<span class="text-[#0451a5]">${quoted}</span>`;
      }
      if (match === "true" || match === "false" || match === "null") {
        return `<span class="text-[#0000ff]">${match}</span>`;
      }
      return `<span class="text-[#098658]">${match}</span>`;
    },
  );
}

type JsonCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function JsonCodeEditor({ value, onChange, className }: JsonCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(1);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (preRef.current) {
      preRef.current.scrollTop = textarea.scrollTop;
      preRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
    }
  }, []);

  useEffect(() => {
    setLineCount(Math.max(1, value.split("\n").length));
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-1 overflow-hidden bg-white dark:bg-zinc-950", className)}>
      <div
        ref={lineNumbersRef}
        className="text-muted-foreground shrink-0 overflow-hidden border-r bg-zinc-50 py-3 pr-2 pl-3 font-mono text-xs leading-5 select-none dark:bg-zinc-900"
        aria-hidden
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="text-right">
            {i + 1}
          </div>
        ))}
      </div>
      <div className="relative min-h-0 min-w-0 flex-1">
        <pre
          ref={preRef}
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono text-xs leading-5 whitespace-pre wrap-break-word"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: highlightJson(value.endsWith("\n") ? `${value} ` : value) }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          spellCheck={false}
          className="absolute inset-0 m-0 resize-none overflow-auto bg-transparent p-3 font-mono text-xs leading-5 text-transparent caret-foreground outline-none selection:bg-blue-200/40 dark:selection:bg-blue-800/40"
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
