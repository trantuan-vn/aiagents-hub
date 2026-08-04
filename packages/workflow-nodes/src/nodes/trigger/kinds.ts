/** Trigger sub-kinds — single source of truth for catalog + definitions. */
export const TRIGGER_KINDS = [
  "manual",
  "app_event",
  "schedule",
  "webhook",
  "form",
  "sub_workflow",
  "chat",
  "evaluation",
  "other",
] as const;

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** Kind field stored on `node.data` for trigger. */
export const TRIGGER_KIND_FIELD = "triggerKind" as const;

/**
 * Kinds with dedicated override definitions/plugins (not factory-generated).
 * `webhook` → `nodes/webhook/`; `form` → FE `nodes/form/` (+ `trigger:form-database` definition).
 */
export const TRIGGER_OVERRIDE_KINDS = new Set<TriggerKind>(["webhook", "form"]);
