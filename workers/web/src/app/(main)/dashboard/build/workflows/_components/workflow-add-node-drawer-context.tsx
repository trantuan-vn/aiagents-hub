"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import type { WorkflowAddNodePick } from "./workflow-add-node-panel";

export type WorkflowAddNodeDrawerOpenOptions = {
  variant?: "full" | "connect";
  allowedNodeTypes?: string[];
  onPick: (pick: WorkflowAddNodePick) => void;
};

type WorkflowAddNodeDrawerContextValue = {
  isOpen: boolean;
  sessionKey: number;
  config: WorkflowAddNodeDrawerOpenOptions | null;
  open: (options: WorkflowAddNodeDrawerOpenOptions) => void;
  close: () => void;
};

const WorkflowAddNodeDrawerContext = createContext<WorkflowAddNodeDrawerContextValue | null>(null);

export function WorkflowAddNodeDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const configRef = useRef<WorkflowAddNodeDrawerOpenOptions | null>(null);
  const [config, setConfig] = useState<WorkflowAddNodeDrawerOpenOptions | null>(null);

  const open = useCallback((options: WorkflowAddNodeDrawerOpenOptions) => {
    configRef.current = options;
    setConfig(options);
    setSessionKey((k) => k + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    configRef.current = null;
    setConfig(null);
  }, []);

  const value = useMemo(
    () => ({ isOpen, sessionKey, config, open, close }),
    [isOpen, sessionKey, config, open, close],
  );

  return <WorkflowAddNodeDrawerContext.Provider value={value}>{children}</WorkflowAddNodeDrawerContext.Provider>;
}

export function useWorkflowAddNodeDrawer(): WorkflowAddNodeDrawerContextValue | null {
  return useContext(WorkflowAddNodeDrawerContext);
}
