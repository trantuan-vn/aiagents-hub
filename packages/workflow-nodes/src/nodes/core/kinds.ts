/** Core sub-kinds — single source of truth for catalog + definitions. */
export const CORE_KINDS = [
  "code",
  "data_table",
  "http_request",
  "webhook",
  "execute_sub_workflow",
  "execution_data",
  "ftp",
  "hub",
  "hub_form",
  "no_op",
  "respond_to_webhook",
  "track_time_saved",
  "wait",
] as const;

export type CoreKind = (typeof CORE_KINDS)[number];

/** Kind field stored on `node.data` for core. */
export const CORE_KIND_FIELD = "coreKind" as const;

/** Kinds with dedicated override definitions/plugins (not factory-generated). */
export const CORE_OVERRIDE_KINDS = new Set<CoreKind>(["http_request", "code", "webhook"]);
