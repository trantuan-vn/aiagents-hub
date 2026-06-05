import {
  ArrowUpDown,
  Braces,
  Calendar,
  Code,
  CopyMinus,
  FileArchive,
  FileInput,
  FileOutput,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Image,
  Key,
  LayoutGrid,
  ListFilter,
  Pencil,
  Rows3,
  Sparkles,
  Split,
  SquareDashed,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";

export type WorkflowTransformKindId =
  | "ai_transform"
  | "code"
  | "date_time"
  | "edit_fields"
  | "filter"
  | "limit"
  | "remove_duplicates"
  | "split_out"
  | "rename_keys"
  | "sort"
  | "aggregate"
  | "merge"
  | "summarize"
  | "compression"
  | "convert_to_file"
  | "crypto"
  | "edit_image"
  | "extract_from_file"
  | "html"
  | "markdown"
  | "spreadsheet_file"
  | "xml";

export type WorkflowTransformCatalogItem = {
  id: WorkflowTransformKindId;
  nameKey: `transform_kind_${WorkflowTransformKindId}`;
  descKey: `transform_kind_${WorkflowTransformKindId}_desc`;
  icon: LucideIcon;
  hasSubmenu?: boolean;
};

export const WORKFLOW_TRANSFORM_POPULAR: WorkflowTransformCatalogItem[] = [
  {
    id: "ai_transform",
    nameKey: "transform_kind_ai_transform",
    descKey: "transform_kind_ai_transform_desc",
    icon: Sparkles,
  },
  {
    id: "code",
    nameKey: "transform_kind_code",
    descKey: "transform_kind_code_desc",
    icon: Braces,
    hasSubmenu: true,
  },
  {
    id: "date_time",
    nameKey: "transform_kind_date_time",
    descKey: "transform_kind_date_time_desc",
    icon: Calendar,
    hasSubmenu: true,
  },
  {
    id: "edit_fields",
    nameKey: "transform_kind_edit_fields",
    descKey: "transform_kind_edit_fields_desc",
    icon: Pencil,
  },
];

export const WORKFLOW_TRANSFORM_ADD_REMOVE: WorkflowTransformCatalogItem[] = [
  {
    id: "filter",
    nameKey: "transform_kind_filter",
    descKey: "transform_kind_filter_desc",
    icon: ListFilter,
  },
  {
    id: "limit",
    nameKey: "transform_kind_limit",
    descKey: "transform_kind_limit_desc",
    icon: SquareDashed,
  },
  {
    id: "remove_duplicates",
    nameKey: "transform_kind_remove_duplicates",
    descKey: "transform_kind_remove_duplicates_desc",
    icon: CopyMinus,
    hasSubmenu: true,
  },
  {
    id: "split_out",
    nameKey: "transform_kind_split_out",
    descKey: "transform_kind_split_out_desc",
    icon: Split,
  },
];

export const WORKFLOW_TRANSFORM_COMBINE: WorkflowTransformCatalogItem[] = [
  {
    id: "aggregate",
    nameKey: "transform_kind_aggregate",
    descKey: "transform_kind_aggregate_desc",
    icon: Rows3,
  },
  {
    id: "merge",
    nameKey: "transform_kind_merge",
    descKey: "transform_kind_merge_desc",
    icon: GitMerge,
  },
  {
    id: "summarize",
    nameKey: "transform_kind_summarize",
    descKey: "transform_kind_summarize_desc",
    icon: LayoutGrid,
  },
];

export const WORKFLOW_TRANSFORM_CONVERT: WorkflowTransformCatalogItem[] = [
  {
    id: "compression",
    nameKey: "transform_kind_compression",
    descKey: "transform_kind_compression_desc",
    icon: FileArchive,
    hasSubmenu: true,
  },
  {
    id: "convert_to_file",
    nameKey: "transform_kind_convert_to_file",
    descKey: "transform_kind_convert_to_file_desc",
    icon: FileInput,
    hasSubmenu: true,
  },
  {
    id: "crypto",
    nameKey: "transform_kind_crypto",
    descKey: "transform_kind_crypto_desc",
    icon: Key,
    hasSubmenu: true,
  },
  {
    id: "edit_image",
    nameKey: "transform_kind_edit_image",
    descKey: "transform_kind_edit_image_desc",
    icon: Image,
    hasSubmenu: true,
  },
  {
    id: "extract_from_file",
    nameKey: "transform_kind_extract_from_file",
    descKey: "transform_kind_extract_from_file_desc",
    icon: FileOutput,
    hasSubmenu: true,
  },
  {
    id: "html",
    nameKey: "transform_kind_html",
    descKey: "transform_kind_html_desc",
    icon: Code,
    hasSubmenu: true,
  },
  {
    id: "markdown",
    nameKey: "transform_kind_markdown",
    descKey: "transform_kind_markdown_desc",
    icon: FileText,
    hasSubmenu: true,
  },
  {
    id: "spreadsheet_file",
    nameKey: "transform_kind_spreadsheet_file",
    descKey: "transform_kind_spreadsheet_file_desc",
    icon: FileSpreadsheet,
    hasSubmenu: true,
  },
  {
    id: "xml",
    nameKey: "transform_kind_xml",
    descKey: "transform_kind_xml_desc",
    icon: Code,
    hasSubmenu: true,
  },
];

export const WORKFLOW_TRANSFORM_OTHER: WorkflowTransformCatalogItem[] = [
  {
    id: "rename_keys",
    nameKey: "transform_kind_rename_keys",
    descKey: "transform_kind_rename_keys_desc",
    icon: TextCursorInput,
  },
  {
    id: "sort",
    nameKey: "transform_kind_sort",
    descKey: "transform_kind_sort_desc",
    icon: ArrowUpDown,
  },
];

export const WORKFLOW_TRANSFORM_CATALOG: WorkflowTransformCatalogItem[] = [
  ...WORKFLOW_TRANSFORM_POPULAR,
  ...WORKFLOW_TRANSFORM_ADD_REMOVE,
  ...WORKFLOW_TRANSFORM_COMBINE,
  ...WORKFLOW_TRANSFORM_CONVERT,
  ...WORKFLOW_TRANSFORM_OTHER,
];
