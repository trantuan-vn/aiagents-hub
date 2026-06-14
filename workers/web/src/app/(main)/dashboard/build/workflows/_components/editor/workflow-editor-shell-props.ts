import type { ReactNode, RefObject } from "react";

import type { WorkflowEditorSettingsSheetProps } from "./workflow-editor-settings-sheet";

export type WorkflowEditorShellSettings = Omit<WorkflowEditorSettingsSheetProps, "open" | "onOpenChange">;

interface WorkflowEditorShellBaseProps {
  workflowId: number;
  workflowName: string;
  onWorkflowNameChange?: (name: string) => void;
  workflowTags?: string[];
  onWorkflowTagsChange?: (tags: string[]) => void;
  nameInputRef?: RefObject<HTMLInputElement>;
  descriptionInputRef?: RefObject<HTMLTextAreaElement>;
  onExecute: () => void;
  children: ReactNode;
  readOnly?: boolean;
  ownerId?: string;
  chatHref?: string;
  headerMeta?: ReactNode;
  backHref?: string;
  backLabel?: string;
  onApplyDefinition?: (definitionJson: string) => void;
  saving?: boolean;
  publishing?: boolean;
  onPublish?: () => void;
  onDuplicate?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onFavorite?: () => void;
  onImportDefinition?: (definitionJson: string) => void;
  onDelete?: () => void;
  onEditName?: () => void;
  onEditNote?: () => void;
}

export interface WorkflowEditorShellEditProps extends WorkflowEditorShellBaseProps {
  readOnly?: false;
  status: "draft" | "published";
  settings: WorkflowEditorShellSettings;
  onAddNode: (type: string, label: string, extra?: Record<string, unknown>) => void;
  onAddStickyNote: () => void;
}

export interface WorkflowEditorShellViewProps extends WorkflowEditorShellBaseProps {
  readOnly: true;
  onAddNode?: (type: string, label: string, extra?: Record<string, unknown>) => void;
  onAddStickyNote?: () => void;
}

export type WorkflowEditorShellProps = WorkflowEditorShellEditProps | WorkflowEditorShellViewProps;

const noop = () => {
  /* view mode */
};

export interface ResolvedWorkflowEditorShellProps {
  editSettings: WorkflowEditorShellSettings | null;
  status: "draft" | "published";
  onAddNode: (type: string, label: string, extra?: Record<string, unknown>) => void;
  onAddStickyNote: () => void;
}

export function resolveWorkflowEditorShellProps(
  props: WorkflowEditorShellProps,
  readOnly: boolean,
): ResolvedWorkflowEditorShellProps {
  if (readOnly) {
    return {
      editSettings: null,
      onAddNode: props.onAddNode ?? noop,
      onAddStickyNote: props.onAddStickyNote ?? noop,
      status: "published",
    };
  }

  const editProps = props as WorkflowEditorShellEditProps;
  return {
    editSettings: editProps.settings,
    onAddNode: editProps.onAddNode,
    onAddStickyNote: editProps.onAddStickyNote,
    status: editProps.status,
  };
}
