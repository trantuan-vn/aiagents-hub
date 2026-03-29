export type ActivityStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  at: number;
};

/** Sắp theo thời gian server/client gửi — đúng thứ tự thực (memory → infer → tool → lượt 2…). */
function sortSteps(steps: ActivityStep[]): ActivityStep[] {
  return [...steps].sort((a, b) => a.at - b.at);
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
