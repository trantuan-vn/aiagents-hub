import {
  createWorkflowTrigger,
  deleteWorkflowTrigger,
  listWorkflowTriggers,
  updateWorkflowTrigger,
} from "../../../_lib/api";

export function isScheduleTriggerNodeLike(node: { type?: string; data?: unknown }): boolean {
  if (node.type !== "trigger") return false;
  const data = (node.data ?? {}) as Record<string, unknown>;
  return data.triggerKind === "schedule";
}

/** Delete D1 cron rows for a Schedule node that was removed from the canvas. */
export async function removeNodeCronTriggers(workflowId: number, nodeId: string) {
  try {
    const { triggers } = await listWorkflowTriggers(workflowId);
    await Promise.all(
      triggers
        .filter((row) => row.type === "cron" && row.nodeId === nodeId)
        .map((row) => deleteWorkflowTrigger(row.triggerId)),
    );
  } catch {
    /* optional — canvas delete still works if the API is unreachable */
  }
}

/** Drop leftover cron rows after the Schedule node is already gone from the canvas. */
export async function pruneOrphanCronTriggers(
  workflowId: number,
  nodes: Array<{ id: string; type?: string; data?: unknown }>,
) {
  try {
    const { triggers } = await listWorkflowTriggers(workflowId);
    const scheduleIds = new Set(nodes.filter(isScheduleTriggerNodeLike).map((node) => node.id));
    await Promise.all(
      triggers
        .filter((row) => {
          if (row.type !== "cron") return false;
          if (row.nodeId) return !scheduleIds.has(row.nodeId);
          return scheduleIds.size === 0;
        })
        .map((row) => deleteWorkflowTrigger(row.triggerId)),
    );
  } catch {
    /* optional */
  }
}

/** Keep D1 cron rows in sync with schedule rules on the trigger node. */
export async function syncNodeCronTriggers(workflowId: number, nodeId: string, exprs: string[]) {
  try {
    const { triggers } = await listWorkflowTriggers(workflowId);
    const existing = triggers
      .filter((row) => row.type === "cron" && row.nodeId === nodeId)
      .sort((a, b) => a.createdAt - b.createdAt);
    const unique = exprs.filter(Boolean);
    const count = Math.max(existing.length, unique.length);
    for (let i = 0; i < count; i += 1) {
      const row = existing[i];
      const expr = unique[i];
      if (row && expr && row.cronExpr !== expr) {
        await updateWorkflowTrigger(row.triggerId, { cronExpr: expr });
      } else if (row && !expr) {
        await deleteWorkflowTrigger(row.triggerId);
      } else if (!row && expr) {
        await createWorkflowTrigger(workflowId, { type: "cron", cronExpr: expr, nodeId });
      }
    }
  } catch {
    /* optional — panel still works without trigger rows */
  }
}
