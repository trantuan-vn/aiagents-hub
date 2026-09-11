import {
  createWorkflowTrigger,
  deleteWorkflowTrigger,
  listWorkflowTriggers,
  updateWorkflowTrigger,
} from "../../../_lib/api";

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
