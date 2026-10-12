"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  canAcceptExpressionDrop,
  readExpressionDrop,
  registerExpressionInsertTarget,
} from "../../panels/node-config/workflow-expression-dnd";
import {
  checkJavaScriptSyntax,
  dollarTokenAt,
  textareaIndexFromPoint,
  workflowExpressionToJs,
  type CodeSyntaxIssue,
} from "./code-editor-utils";

const SUGGESTIONS = [
  { id: "all", label: "$input.all()", insert: "$input.all()" },
  { id: "first", label: "$input.first()", insert: "$input.first()" },
  { id: "last", label: "$input.last()", insert: "$input.last()" },
  { id: "item", label: "$input.item", insert: "$input.item" },
  { id: "itemJson", label: "$input.item.json", insert: "$input.item.json" },
  { id: "json", label: "$json", insert: "$json" },
  { id: "index", label: "$itemIndex", insert: "$itemIndex" },
] as const;

type JsCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  suggestionDetails?: Record<string, string>;
  checkLabel: string;
  checkOkLabel: string;
  checkEmptyLabel: string;
  checkErrorLabel: string;
};

export function JsCodeEditor({
  value,
  onChange,
  suggestionDetails,
  checkLabel,
  checkOkLabel,
  checkEmptyLabel,
  checkErrorLabel,
}: JsCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const pendingCaret = useRef<number | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const unregisterRef = useRef<(() => void) | null>(null);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const [caret, setCaret] = useState(0);
  const [suppressedStart, setSuppressedStart] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [issue, setIssue] = useState<CodeSyntaxIssue | null>(null);
  const [checkedOk, setCheckedOk] = useState(false);

  const token = dollarTokenAt(value, caret);
  const suggestions = useMemo(() => {
    if (!token || suppressedStart === token.start) return [];
    const query = token.text.toLowerCase();
    return SUGGESTIONS.filter((item) => item.label.toLowerCase().startsWith(query));
  }, [suppressedStart, token]);

  useEffect(() => {
    setActiveIndex(0);
  }, [token?.text]);

  const rememberCaret = (element: HTMLTextAreaElement) => {
    selectionRef.current = { start: element.selectionStart, end: element.selectionEnd };
    setCaret(element.selectionStart);
  };

  const write = useCallback((next: string, nextCaret: number) => {
    pendingCaret.current = nextCaret;
    setCaret(nextCaret);
    onChangeRef.current(next);
  }, []);

  const insertText = useCallback(
    (start: number, end: number, text: string) => {
      const current = valueRef.current;
      const safeStart = Math.max(0, Math.min(start, current.length));
      const safeEnd = Math.max(safeStart, Math.min(end, current.length));
      write(current.slice(0, safeStart) + text + current.slice(safeEnd), safeStart + text.length);
    },
    [write],
  );

  const insertExpression = useCallback(
    (expression: string) => {
      const element = textareaRef.current;
      const current = valueRef.current;
      const focused = element != null && document.activeElement === element;
      const start = focused ? element.selectionStart : selectionRef.current.start;
      const end = focused ? element.selectionEnd : selectionRef.current.end;
      insertText(start, end, workflowExpressionToJs(expression));
    },
    [insertText],
  );
  const insertExpressionRef = useRef(insertExpression);
  insertExpressionRef.current = insertExpression;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    const onFocus = () => {
      unregisterRef.current?.();
      unregisterRef.current = registerExpressionInsertTarget({
        insert: (expression) => insertExpressionRef.current(expression),
      });
    };
    element.addEventListener("focus", onFocus);
    if (document.activeElement === element) onFocus();
    return () => {
      element.removeEventListener("focus", onFocus);
      unregisterRef.current?.();
      unregisterRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    const nextCaret = pendingCaret.current;
    if (!element || nextCaret == null) return;
    pendingCaret.current = null;
    element.focus();
    const clamped = Math.max(0, Math.min(nextCaret, element.value.length));
    element.setSelectionRange(clamped, clamped);
    setCaret(clamped);
  }, [value]);

  const acceptSuggestion = (insert: string) => {
    if (!token) return;
    setSuppressedStart(null);
    insertText(token.start, caret, insert);
  };

  const runCheck = () => {
    const problem = checkJavaScriptSyntax(value);
    if (!problem) {
      setIssue(null);
      setCheckedOk(true);
      toast.success(checkOkLabel);
      return;
    }
    setCheckedOk(false);
    if (problem.message === "empty") {
      setIssue(null);
      toast.error(checkEmptyLabel);
      return;
    }
    setIssue(problem);
    toast.error(checkErrorLabel.replace("{line}", String(problem.line)).replace("{message}", problem.message));
    const element = textareaRef.current;
    if (!element) return;
    const lines = value.split("\n");
    const offset = lines.slice(0, problem.line - 1).join("\n").length + (problem.line > 1 ? 1 : 0);
    const column = Math.max(0, problem.column - 1);
    const position = Math.min(value.length, offset + column);
    element.focus();
    element.setSelectionRange(position, position);
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 20;
    element.scrollTop = Math.max(0, (problem.line - 2) * lineHeight);
    if (gutterRef.current) gutterRef.current.scrollTop = element.scrollTop;
  };

  const lineCount = Math.max(1, value.split("\n").length);

  return (
    <div className={cn("overflow-hidden rounded-md border bg-white dark:bg-zinc-950", issue && "border-red-500")}>
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <span className="text-xs font-medium">JavaScript</span>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={runCheck}>
          {checkLabel}
        </Button>
      </div>
      <div className="flex h-[280px] min-h-[220px]">
        <div
          ref={gutterRef}
          className="text-muted-foreground w-10 shrink-0 overflow-hidden border-r bg-zinc-50 py-3 text-right font-mono text-xs leading-5 select-none dark:bg-zinc-900"
          aria-hidden
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index} className={cn("pr-2", issue?.line === index + 1 && "bg-red-500/10 font-semibold text-red-600")}>
              {index + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          wrap="off"
          spellCheck={false}
          className="min-w-0 flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-xs leading-5 outline-none"
          onChange={(event) => {
            const next = event.target.value;
            const nextCaret = event.target.selectionStart;
            const typedDollar = next.length >= valueRef.current.length && next[nextCaret - 1] === "$";
            if (typedDollar) setSuppressedStart(null);
            setIssue(null);
            setCheckedOk(false);
            setCaret(nextCaret);
            onChange(next);
          }}
          onClick={(event) => rememberCaret(event.currentTarget)}
          onKeyUp={(event) => rememberCaret(event.currentTarget)}
          onSelect={(event) => rememberCaret(event.currentTarget)}
          onScroll={(event) => {
            if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
          onDragEnter={(event) => {
            if (!canAcceptExpressionDrop(event.dataTransfer)) return;
            event.preventDefault();
          }}
          onDragOver={(event) => {
            if (!canAcceptExpressionDrop(event.dataTransfer)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            if (!canAcceptExpressionDrop(event.dataTransfer)) return;
            event.preventDefault();
            const expression = readExpressionDrop(event.dataTransfer) ?? event.dataTransfer.getData("text/plain");
            if (!expression.trim()) return;
            const index = textareaIndexFromPoint(event.currentTarget, event.clientX, event.clientY);
            insertText(index, index, workflowExpressionToJs(expression));
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              if (suggestions.length > 0) {
                acceptSuggestion(suggestions[activeIndex]?.insert ?? suggestions[0].insert);
                return;
              }
              const element = event.currentTarget;
              insertText(element.selectionStart, element.selectionEnd, "  ");
              return;
            }
            if (event.key === "Escape" && token && suggestions.length > 0) {
              setSuppressedStart(token.start);
            }
          }}
        />
      </div>
      {suggestions.length > 0 ? (
        <ul className="max-h-40 overflow-auto border-t bg-white dark:bg-zinc-950">
          {suggestions.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left",
                  index === activeIndex ? "bg-amber-50 dark:bg-amber-500/10" : "hover:bg-muted/60",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  acceptSuggestion(item.insert);
                }}
              >
                <span className="font-mono text-xs">{item.label}</span>
                {suggestionDetails?.[item.id] ? (
                  <span className="text-muted-foreground truncate text-[10px]">{suggestionDetails[item.id]}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {issue ? (
        <p className="border-t border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {checkErrorLabel.replace("{line}", String(issue.line)).replace("{message}", issue.message)}
        </p>
      ) : null}
      {checkedOk && !issue ? (
        <p className="border-t border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          {checkOkLabel}
        </p>
      ) : null}
    </div>
  );
}
