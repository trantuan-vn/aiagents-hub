"use client";

import { memo, useCallback } from "react";

import { Position, useNodeId, useStore } from "@xyflow/react";
import { useTranslations } from "next-intl";

import {
  canShowConnectionPlus,
  ConnectionHandleCluster,
  ConnectionHandleDot,
  ConnectionHandleWithPlus,
  getConnectedSide,
  getHandleClusterClass,
  useHandleConnectionState,
} from "./connection-handle-parts";
import { useWorkflowCanvasUi } from "./workflow-canvas-ui-context";
import { type WorkflowHandleId } from "./workflow-connection-utils";

interface ConnectionHandleProps {
  handleId: WorkflowHandleId;
  type: "target" | "source";
  position: Position;
  accentClass?: string;
  label?: string;
  showAddNode?: boolean;
  shape?: "circle" | "diamond";
  allowedNodeTypes?: string[];
  allowMultipleConnections?: boolean;
  required?: boolean;
  /** Override React Flow handle anchor (e.g. split true/false vertically). */
  handleStyle?: React.CSSProperties;
}

function useConnectionHandleModel({
  handleId,
  type,
  position,
  showAddNode = true,
  allowedNodeTypes,
  allowMultipleConnections = false,
}: ConnectionHandleProps) {
  const nodeId = useNodeId();
  const ui = useWorkflowCanvasUi();
  const readOnly = ui?.readOnly ?? true;
  const createConnectedNode = ui?.createConnectedNode;
  const t = useTranslations("WorkflowEditorPage");
  const edges = useStore((s) => s.edges);
  const hasConnection = useHandleConnectionState(
    nodeId ?? null,
    handleId,
    type,
    edges,
    allowMultipleConnections,
  );
  const side = position === Position.Bottom ? "bottom" : getConnectedSide(position);

  const onPick = useCallback(
    ({ type: nodeType, label: nodeLabel, extra }: { type: string; label: string; extra?: Record<string, unknown> }) => {
      if (!nodeId || !createConnectedNode) return;
      if (position === Position.Bottom) {
        createConnectedNode({
          fromNodeId: nodeId,
          side: "resource",
          type: nodeType,
          label: nodeLabel,
          resourceHandle: handleId,
          extraData: extra,
        });
      } else {
        createConnectedNode({
          fromNodeId: nodeId,
          side,
          type: nodeType,
          label: nodeLabel,
          sourceHandle: handleId === "in" ? undefined : handleId,
          extraData: extra,
        });
      }
    },
    [createConnectedNode, handleId, nodeId, position, side],
  );

  const showPlus = canShowConnectionPlus(
    showAddNode,
    readOnly,
    hasConnection,
    !!createConnectedNode,
    allowMultipleConnections,
  );

  return {
    t,
    onPick,
    showPlus,
    clusterClass: getHandleClusterClass(position),
    isSideHandle: position === Position.Left || position === Position.Right,
    allowedNodeTypes,
  };
}

function ConnectionHandleView({
  handleId,
  type,
  position,
  accentClass,
  label,
  shape,
  required,
  model,
}: ConnectionHandleProps & { model: ReturnType<typeof useConnectionHandleModel> }) {
  const { t, onPick, showPlus, clusterClass, isSideHandle, allowedNodeTypes } = model;

  return (
    <ConnectionHandleCluster
      label={label}
      required={required}
      isSideHandle={isSideHandle}
      clusterClass={clusterClass}
    >
      {showPlus ? (
        <ConnectionHandleWithPlus
          handleId={handleId}
          type={type}
          position={position}
          accentClass={accentClass}
          shape={shape}
          onPick={onPick}
          t={t}
          allowedNodeTypes={allowedNodeTypes}
        />
      ) : (
        <ConnectionHandleDot
          handleId={handleId}
          type={type}
          position={position}
          accentClass={accentClass}
          shape={shape}
        />
      )}
    </ConnectionHandleCluster>
  );
}

function ConnectionHandleInner(props: ConnectionHandleProps) {
  const model = useConnectionHandleModel(props);
  return <ConnectionHandleView {...props} model={model} />;
}

export const ConnectionHandle = memo(ConnectionHandleInner);
ConnectionHandle.displayName = "ConnectionHandle";
