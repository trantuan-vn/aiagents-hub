import type { AgentPlan, PlannerMode, PlanStep } from './types.js';

export function normalizePlannerMode(value: unknown): PlannerMode {
  if (value === true || value === 'on') return 'on';
  if (value === false || value === 'off') return 'off';
  return 'auto';
}

export function shouldPlan(args: {
  enablePlanner: PlannerMode;
  toolCount: number;
  userText: string;
}): boolean {
  if (args.enablePlanner === 'off' || args.enablePlanner === false) return false;
  if (args.enablePlanner === 'on' || args.enablePlanner === true) return true;
  return args.toolCount >= 2 || args.userText.trim().length >= 200;
}

export function parsePlan(raw: Record<string, unknown> | null): AgentPlan {
  const stepsIn = Array.isArray(raw?.steps) ? raw?.steps : [];
  const steps: PlanStep[] = [];
  stepsIn.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const action = String(row.action ?? '').trim();
    if (!action) return;
    const risk = String(row.risk ?? 'low') === 'high' ? 'high' : 'low';
    steps.push({
      id: String(row.id ?? `s${index + 1}`),
      action,
      tool: row.tool ? String(row.tool) : undefined,
      successCriterion: row.successCriterion ? String(row.successCriterion) : undefined,
      risk,
    });
  });
  return { steps };
}

export const PLAN_PROMPT = `Create a short JSON plan. Reply with JSON only:
{"steps":[{"id":"s1","action":"...","tool":"optional_tool_name","successCriterion":"...","risk":"low"}]}
Use 1-5 steps. Set risk to "high" only for write/delete/persist actions. Prefer retrieve tools before inventing facts; call validate tools before claiming a draft is final.`;
