"use client";

import { useSyncExternalStore } from "react";

import {
  workflowAddNodeDrawerActions,
  workflowAddNodeDrawerStore,
  type WorkflowAddNodeDrawerOpenOptions,
  type WorkflowAddNodeDrawerState,
} from "./workflow-add-node-drawer-store";

export type { WorkflowAddNodeDrawerOpenOptions };

/** Stable open/close — does not subscribe to drawer visibility. */
export function useWorkflowAddNodeDrawerActions() {
  return workflowAddNodeDrawerActions;
}

/** Drawer visibility + config — only drawer UI should subscribe. */
export function useWorkflowAddNodeDrawerState(): WorkflowAddNodeDrawerState {
  return useSyncExternalStore(
    workflowAddNodeDrawerStore.subscribe,
    workflowAddNodeDrawerStore.getState,
    workflowAddNodeDrawerStore.getState,
  );
}

export function useWorkflowAddNodeDrawer() {
  return {
    ...useWorkflowAddNodeDrawerState(),
    ...useWorkflowAddNodeDrawerActions(),
  };
}
