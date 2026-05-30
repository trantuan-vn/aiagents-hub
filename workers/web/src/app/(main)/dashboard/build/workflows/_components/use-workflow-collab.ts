"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useWs, sendWsMessage } from "@/core/use-ws";

import { getWorkflowCollab, publishWorkflowCollab } from "../_lib/api";

interface UseWorkflowCollabOptions {
  workflowId: number;
  definition: string;
  onRemoteDefinition: (definitionJson: string) => void;
  /** When set, also sync via WebSocket broadcast (faster than HTTP polling). */
  user?: { identifier: string } | null;
  enabled?: boolean;
}

function randomEditorId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ed_${Date.now()}`;
}

const collabWsHandlers = (workflowId: number, editorId: string, onRemote: (def: string) => void) => ({
  workflow_collab: (data: unknown) => {
    const payload = data as {
      workflowId?: number;
      definition?: string;
      editorId?: string;
    };
    if (payload.workflowId !== workflowId || !payload.definition) return;
    if (payload.editorId === editorId) return;
    onRemote(payload.definition);
  },
});

/**
 * Realtime workflow canvas sync via HTTP (and optional WebSocket when user is known).
 */
export function useWorkflowCollab({
  workflowId,
  definition,
  onRemoteDefinition,
  user = null,
  enabled = true,
}: UseWorkflowCollabOptions) {
  const editorIdRef = useRef(randomEditorId());
  const lastSentRef = useRef("");
  const onRemoteRef = useRef(onRemoteDefinition);
  onRemoteRef.current = onRemoteDefinition;

  const wsHandlers = useMemo(
    () => collabWsHandlers(workflowId, editorIdRef.current, (def) => onRemoteRef.current(def)),
    [workflowId],
  );

  useWs(user?.identifier ? user : null, wsHandlers);

  useEffect(() => {
    if (!enabled || !workflowId) return;
    void getWorkflowCollab(workflowId)
      .then(({ state }) => {
        if (!state?.definition || state.editorId === editorIdRef.current) return;
        onRemoteRef.current(state.definition);
      })
      .catch(() => {
        /* collab optional */
      });
  }, [enabled, workflowId]);

  const publish = useCallback(
    (definitionJson: string) => {
      if (!enabled || !workflowId) return;
      if (definitionJson === lastSentRef.current) return;
      lastSentRef.current = definitionJson;

      const editorId = editorIdRef.current;
      if (user?.identifier) {
        const sent = sendWsMessage({
          type: "workflow_collab",
          workflowId,
          definition: definitionJson,
          editorId,
        });
        if (sent) return;
      }

      void publishWorkflowCollab(workflowId, {
        definition: definitionJson,
        editorId,
      }).catch(() => {
        /* ignore */
      });
    },
    [enabled, workflowId, user?.identifier],
  );

  useEffect(() => {
    if (!enabled || !definition) return;
    const timer = setTimeout(() => publish(definition), 600);
    return () => clearTimeout(timer);
  }, [definition, enabled, publish]);
}
