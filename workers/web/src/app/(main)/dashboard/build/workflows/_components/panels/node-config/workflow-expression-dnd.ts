export const WORKFLOW_EXPRESSION_MIME = "application/x-aiagents-hub-expression";

export type WorkflowExpressionDragPayload = {
  expression: string;
};

export function jsonPathToExpression(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "{{ $json }}";
  return `{{ $json.${trimmed} }}`;
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

export function insertExpression(
  current: string,
  expression: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): string {
  const start = selectionStart ?? current.length;
  const end = selectionEnd ?? start;
  return current.slice(0, start) + expression + current.slice(end);
}
