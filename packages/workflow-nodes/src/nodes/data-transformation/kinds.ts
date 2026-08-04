/** Data-transformation sub-kinds — single source of truth for catalog + definitions. */
export const TRANSFORM_KINDS = [
  "ai_transform",
  "code",
  "date_time",
  "edit_fields",
  "filter",
  "limit",
  "remove_duplicates",
  "split_out",
  "rename_keys",
  "sort",
  "aggregate",
  "merge",
  "summarize",
  "compression",
  "convert_to_file",
  "crypto",
  "edit_image",
  "extract_from_file",
  "html",
  "markdown",
  "spreadsheet_file",
  "xml",
] as const;

export type TransformKind = (typeof TRANSFORM_KINDS)[number];

/** Kind field stored on `node.data` for data_transformation. */
export const TRANSFORM_KIND_FIELD = "transformKind" as const;

/** Kinds with dedicated override modules (none yet — all factory-generated). */
export const TRANSFORM_OVERRIDE_KINDS = new Set<TransformKind>([]);
