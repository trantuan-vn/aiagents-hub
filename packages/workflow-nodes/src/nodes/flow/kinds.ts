/** Flow sub-kinds — single source of truth for catalog + definitions. */
export const FLOW_KINDS = [
  "filter",
  "if",
  "loop_over_items",
  "merge",
  "compare_datasets",
  "execute_sub_workflow",
  "stop_and_error",
  "switch",
  "wait",
] as const;

export type FlowKind = (typeof FLOW_KINDS)[number];

/** Kind field stored on `node.data` for flow. */
export const FLOW_KIND_FIELD = "flowKind" as const;

/** Kinds with dedicated override definitions/plugins (not factory-generated). */
export const FLOW_OVERRIDE_KINDS = new Set<FlowKind>(["loop_over_items"]);
