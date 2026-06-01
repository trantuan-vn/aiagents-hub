import type { ReactNode } from "react";

import type { WorkflowEditorSettingsSheetProps } from "./workflow-editor-settings-sheet";

export type WorkflowEditorShellSettings = Omit<WorkflowEditorSettingsSheetProps, "open" | "onOpenChange">;

interface WorkflowEditorShellBaseProps {
  workflowId: number;
  workflowName: string;
  serviceEndpoint?: string;
  onExecute: () => void;
  children: ReactNode;
  readOnly?: boolean;
  ownerId?: string;
  chatHref?: string;
  headerMeta?: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Replace the canvas definition (text-to-workflow / restore / auto-fix). */
  onApplyDefinition?: (definitionJson: string) => void;
}

export interface WorkflowEditorShellEditProps extends WorkflowEditorShellBaseProps {
  readOnly?: false;
  settings: WorkflowEditorShellSettings;
  saving: boolean;
  onSave: () => void;
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
  saving: boolean;
  onSave?: () => void;
  onAddNode: (type: string, label: string, extra?: Record<string, unknown>) => void;
  onAddStickyNote: () => void;
  status: "draft" | "published";
}

export function resolveWorkflowEditorShellProps(
  props: WorkflowEditorShellProps,
  readOnly: boolean,
): ResolvedWorkflowEditorShellProps {
  if (readOnly) {
    return {
      editSettings: null,
      saving: false,
      onSave: undefined,
      onAddNode: props.onAddNode ?? noop,
      onAddStickyNote: props.onAddStickyNote ?? noop,
      status: "published",
    };
  }

  const editProps = props as WorkflowEditorShellEditProps;
  return {
    editSettings: editProps.settings,
    saving: editProps.saving,
    onSave: editProps.onSave,
    onAddNode: editProps.onAddNode,
    onAddStickyNote: editProps.onAddStickyNote,
    status: editProps.settings.status,
  };
}
