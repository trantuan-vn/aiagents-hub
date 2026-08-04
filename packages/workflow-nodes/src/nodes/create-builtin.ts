import type { WorkflowNodeDefinition } from "../types/node-definition";

/** Stamp a partial definition as a built-in registry entry. */
export function createBuiltin(
  partial: Omit<WorkflowNodeDefinition, "isBuiltin" | "isActive" | "createdAt" | "updatedAt">,
): WorkflowNodeDefinition {
  const ts = new Date().toISOString();
  return { ...partial, isBuiltin: true, isActive: true, createdAt: ts, updatedAt: ts };
}
