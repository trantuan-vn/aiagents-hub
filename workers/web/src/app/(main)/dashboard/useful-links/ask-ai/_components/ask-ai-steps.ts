const STEP_ORDER = ["receive", "infer", "parse", "complete"] as const;

export type ActivityStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  at: number;
};

function sortSteps(steps: ActivityStep[]): ActivityStep[] {
  return [...steps].sort((a, b) => {
    const ia = STEP_ORDER.indexOf(a.id as (typeof STEP_ORDER)[number]);
    const ib = STEP_ORDER.indexOf(b.id as (typeof STEP_ORDER)[number]);
    const sa = ia === -1 ? 99 : ia;
    const sb = ib === -1 ? 99 : ib;
    return sa - sb;
  });
}

export function mergeServerStep(
  prev: ActivityStep[],
  incoming: { stepId: string; label: string; status: string },
): ActivityStep[] {
  const statusMap: Record<string, ActivityStep["status"]> = {
    running: "running",
    done: "done",
    error: "error",
  };
  const status = statusMap[incoming.status] ?? "running";
  const next: ActivityStep = {
    id: incoming.stepId,
    label: incoming.label,
    status,
    at: Date.now(),
  };
  const idx = prev.findIndex((s) => s.id === incoming.stepId);
  if (idx === -1) return sortSteps([...prev, next]);
  const copy = [...prev];
  copy[idx] = next;
  return sortSteps(copy);
}
