export const WORKFLOW_EXPRESSION_MIME = "application/x-aiagents-hub-expression";

export type WorkflowExpressionDragPayload = {
  expression: string;
};

const JSON_OPERAND_RE = /^\$json(?:\.[A-Za-z0-9_]+)*$/;
const JOIN_OPS = ["||", "??", "&&"] as const;
type JoinOp = (typeof JOIN_OPS)[number];

export function jsonPathToExpression(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "{{ $json }}";
  return `{{ $json.${trimmed} }}`;
}

export function jsonPathsToOrExpression(paths: string[]): string {
  const operands = paths
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => (path === "$json" || path.startsWith("$json.") ? path : `$json.${path}`));
  return joinExpression(uniqueOperands(operands), "||");
}

function uniqueOperands(operands: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const op of operands) {
    if (seen.has(op)) continue;
    seen.add(op);
    out.push(op);
  }
  return out;
}

function joinExpression(operands: string[], join: JoinOp): string {
  if (!operands.length) return "";
  if (operands.length === 1) return `{{ ${operands[0]} }}`;
  return `{{ ${operands.join(` ${join} `)} }}`;
}

function isExpressionOnlyField(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(?:\{\{[\s\S]*?\}\}\s*)+$/.test(trimmed);
}

function parseSimpleJoinField(value: string): { operands: string[]; join: JoinOp } | null {
  const trimmed = value.trim();
  if (!trimmed) return { operands: [], join: "||" };
  const blocks = trimmed.match(/\{\{[\s\S]*?\}\}/g);
  if (!blocks) return null;
  const operands: string[] = [];
  let join: JoinOp | null = null;
  for (const block of blocks) {
    const inner = block.slice(2, -2).trim();
    if (!inner) continue;
    const parts = inner.split(/\s*(\|\||\?\?|&&)\s*/);
    if (parts.length % 2 === 0) return null;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]?.trim() ?? "";
      if (i % 2 === 1) {
        if (!JOIN_OPS.includes(part as JoinOp)) return null;
        if (join && join !== part) return null;
        join = part as JoinOp;
        continue;
      }
      if (!JSON_OPERAND_RE.test(part)) return null;
      if (!operands.includes(part)) operands.push(part);
    }
  }
  return { operands, join: join ?? "||" };
}

/** `$json.path` operands inside {{ }} blocks joined by ||, ??, or &&. */
export function extractJsonOperands(value: string): string[] | null {
  return parseSimpleJoinField(value)?.operands ?? null;
}

export function contextPathToExpression(path: string): string {
  return `{{ ${path} }}`;
}

export function setExpressionDragData(dataTransfer: DataTransfer, expression: string): void {
  const payload: WorkflowExpressionDragPayload = { expression };
  dataTransfer.setData(WORKFLOW_EXPRESSION_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", expression);
  dataTransfer.effectAllowed = "copy";
}

export function canAcceptExpressionDrop(dataTransfer: DataTransfer): boolean {
  const types = dataTransfer.types;
  if (typeof types.includes === "function") {
    return (
      types.includes(WORKFLOW_EXPRESSION_MIME) ||
      types.includes("text/plain") ||
      types.includes("text/uri-list")
    );
  }
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (type === WORKFLOW_EXPRESSION_MIME || type === "text/plain" || type === "text/uri-list") {
      return true;
    }
  }
  return false;
}

export function readExpressionDrop(dataTransfer: DataTransfer): string | null {
  const raw = dataTransfer.getData(WORKFLOW_EXPRESSION_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WorkflowExpressionDragPayload;
      if (typeof parsed.expression === "string") return parsed.expression;
    } catch {
      /* fall through */
    }
  }
  const plain = dataTransfer.getData("text/plain").trim();
  if (plain.startsWith("{{") && plain.endsWith("}}")) return plain;
  return null;
}

/**
 * Drop a second $json field into the same fx box joins with the existing
 * operator (|| by default). Complex expressions (ternary, comparisons) insert at the caret.
 */
export function insertExpression(
  current: string,
  expression: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): string {
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? start;
  const remainder = current.slice(0, start) + current.slice(end);
  const incoming = parseSimpleJoinField(expression);
  const existing = parseSimpleJoinField(remainder);

  if (incoming && existing && isExpressionOnlyField(remainder) && isExpressionOnlyField(expression)) {
    return joinExpression(uniqueOperands([...existing.operands, ...incoming.operands]), existing.join);
  }

  if (start !== end) {
    return current.slice(0, start) + expression + current.slice(end);
  }
  if (current.includes(expression)) return current;
  return current.slice(0, start) + expression + current.slice(end);
}

type ExpressionInsertTarget = {
  insert: (expression: string) => void;
};

let lastExpressionInsertTarget: ExpressionInsertTarget | null = null;

/** Register the focused fx field so INPUT click/drag can insert into it. */
export function registerExpressionInsertTarget(target: ExpressionInsertTarget): () => void {
  lastExpressionInsertTarget = target;
  return () => {
    if (lastExpressionInsertTarget === target) lastExpressionInsertTarget = null;
  };
}

/** Insert into the last focused ExpressionDropField. Returns false if none focused. */
export function insertExpressionIntoFocusedField(expression: string): boolean {
  if (!lastExpressionInsertTarget) return false;
  lastExpressionInsertTarget.insert(expression);
  return true;
}

export async function copyExpressionToClipboard(expression: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(expression);
    return true;
  } catch {
    return false;
  }
}
