/** Fields a node produces that the next node should drag into Parameters. */

export type WorkflowNodeLike = {
  type?: string | null;
  data?: Record<string, unknown> | null;
};

type FormElementLike = {
  id?: string;
  fieldName?: string;
};

function dataOf(node: WorkflowNodeLike): Record<string, unknown> {
  return node.data && typeof node.data === "object" ? node.data : {};
}

function formFieldNames(node: WorkflowNodeLike): string[] {
  const elements = dataOf(node).formElements;
  if (!Array.isArray(elements)) return [];
  const names: string[] = [];
  for (const el of elements as FormElementLike[]) {
    const key = String(el.fieldName || el.id || "").trim();
    if (key) names.push(key);
  }
  return names;
}

/** JSON paths on this node's output that downstream nodes should map. */
export function primaryOutputPaths(
  node: WorkflowNodeLike,
  options?: { sourceHandle?: string | null },
): string[] {
  const data = dataOf(node);
  const type = String(node.type ?? "");
  const triggerKind = String(data.triggerKind ?? "");
  const coreKind = String(data.coreKind ?? "");
  const toolKind = String(data.toolKind ?? "");
  const flowKind = String(data.flowKind ?? "");
  const handle = String(options?.sourceHandle ?? "");

  if (triggerKind === "chat") return ["chatInput"];
  if (triggerKind === "webhook" || coreKind === "webhook" || type === "webhook") {
    return ["body.question"];
  }
  if (triggerKind === "form" || type === "form") {
    const names = formFieldNames(node);
    return names.length ? names : ["u", "p", "c"];
  }
  if (type === "tool_node" && toolKind === "get-rag") return ["query", "ragText"];
  if (type === "tool_node" && toolKind === "get-db-info") return ["items"];
  if (type === "tool_node" && toolKind === "save-rag") return ["ok", "saved"];
  if (type === "flow" && flowKind === "loop_over_items") {
    if (handle === "done") return ["totalBatches", "schemaName", "loopCompleted"];
    return ["tableName"];
  }
  if (type === "agent") return ["sql", "text"];
  if (type === "http_request" || coreKind === "http_request") return ["data", "status"];
  if (type === "human_review") return ["to", "sent"];
  return [];
}

/** OUTPUT panel: loop has two handles, so show both branch fields. */
export function primaryOutputPathsForDisplay(node: WorkflowNodeLike): string[] {
  const data = dataOf(node);
  const isLoop = String(node.type ?? "") === "flow" && String(data.flowKind ?? "") === "loop_over_items";
  if (isLoop) {
    const loop = primaryOutputPaths(node);
    const done = primaryOutputPaths(node, { sourceHandle: "done" });
    return [...new Set([...loop, ...done])];
  }
  return primaryOutputPaths(node);
}

export function isPrimaryOutputPath(path: string, primaryPaths: string[]): boolean {
  return primaryPaths.includes(path);
}

export function isPrimaryOutputAncestor(path: string, primaryPaths: string[]): boolean {
  return primaryPaths.some((primary) => primary.startsWith(`${path}.`) || primary.startsWith(`${path}[`));
}

export function primaryPathsPresentInData(
  data: Record<string, unknown> | null | undefined,
  primaryPaths: string[],
): string[] {
  if (!data) return [];
  return primaryPaths.filter((path) => pathExists(data, path));
}

function pathExists(root: Record<string, unknown>, path: string): boolean {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur !== undefined;
}
