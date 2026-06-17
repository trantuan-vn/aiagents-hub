export type WorkflowAddNodeCategoryId =
  | "ai"
  | "action_in_app"
  | "data_transformation"
  | "flow"
  | "core"
  | "human_review"
  | "trigger";

export type WorkflowCatalogEntrySeed = {
  id: string;
  addCategory: WorkflowAddNodeCategoryId;
  runtimeType: string;
  kind?: string;
  nameKey: string;
  descKey: string;
  hasBackend: boolean;
  hasFrontend: boolean;
  sortOrder?: number;
};

export type WorkflowCatalogEntry = WorkflowCatalogEntrySeed & {
  isActive: boolean;
  updatedAt: number;
  sortOrder?: number;
};
