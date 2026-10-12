import { parse } from "acorn";

/** Turn an INPUT-panel expression into JavaScript the Code node can run. */
export function workflowExpressionToJs(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) return "";
  const converted = trimmed.replace(/\{\{([\s\S]*?)\}\}/g, (_match, inner: string) =>
    rewriteJsonRoot(String(inner).trim()),
  );
  return rewriteJsonRoot(converted);
}

function rewriteJsonRoot(code: string): string {
  return code.replace(/\$json\b/g, "$input.item.json");
}

export type CodeSyntaxIssue = {
  line: number;
  column: number;
  message: string;
};

/** Parse user JavaScript the same way it runs: as the body of an async function. */
export function checkJavaScriptSyntax(code: string): CodeSyntaxIssue | null {
  const source = code.replace(/\r\n/g, "\n");
  if (!source.trim()) {
    return { line: 1, column: 1, message: "empty" };
  }
  const wrapped = `async function __check__() {\n${source}\n}`;
  try {
    parse(wrapped, { ecmaVersion: "latest", sourceType: "script", locations: true });
    return null;
  } catch (error) {
    const loc = (error as { loc?: { line?: number; column?: number } }).loc;
    const raw = error instanceof Error ? error.message : String(error);
    const message = raw.replace(/\s*\(\d+:\d+\)$/, "");
    return {
      line: Math.max(1, (loc?.line ?? 2) - 1),
      column: (loc?.column ?? 0) + 1,
      message,
    };
  }
}

export function dollarTokenAt(value: string, cursor: number): { start: number; text: string } | null {
  if (cursor < 0) return null;
  const match = value.slice(0, cursor).match(/\$[A-Za-z0-9_.]*$/);
  if (!match || match.index == null) return null;
  return { start: match.index, text: match[0] };
}

/** Character index in a `white-space: pre` textarea closest to a pointer event. */
export function textareaIndexFromPoint(textarea: HTMLTextAreaElement, clientX: number, clientY: number): number {
  const value = textarea.value;
  const style = getComputedStyle(textarea);
  const rect = textarea.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const x = clientX - rect.left - paddingLeft + textarea.scrollLeft;
  const y = clientY - rect.top - paddingTop + textarea.scrollTop;
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const lines = value.split("\n");
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(Math.max(0, y) / lineHeight)));
  const line = lines[lineIndex] ?? "";
  const prefixLength = lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);

  const mirror = document.createElement("div");
  mirror.style.position = "fixed";
  mirror.style.left = "-9999px";
  mirror.style.top = "0";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre";
  mirror.style.font = style.font;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.tabSize = style.tabSize;
  mirror.style.width = `${Math.max(0, textarea.clientWidth - paddingLeft - paddingRight)}px`;
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  document.body.appendChild(mirror);
  try {
    const columnX = (column: number) => {
      mirror.replaceChildren(document.createTextNode(line.slice(0, column)), marker);
      return marker.offsetLeft;
    };
    let low = 0;
    let high = line.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (columnX(mid) < x) low = mid + 1;
      else high = mid;
    }
    const previous = Math.max(0, low - 1);
    const column = Math.abs(columnX(previous) - x) <= Math.abs(columnX(Math.min(line.length, low)) - x) ? previous : low;
    return Math.min(value.length, prefixLength + column);
  } finally {
    mirror.remove();
  }
}
