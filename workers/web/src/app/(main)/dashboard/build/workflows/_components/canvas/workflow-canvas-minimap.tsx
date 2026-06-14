"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  MiniMap,
  Panel,
  useOnViewportChange,
  useStoreApi,
  type OnMoveEnd,
  type OnMoveStart,
  type Viewport,
} from "@xyflow/react";
import { Map } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PEEK_MS = 1000;

function viewportPanned(prev: Viewport, next: Viewport) {
  return prev.x !== next.x || prev.y !== next.y;
}

export function WorkflowCanvasMinimap() {
  const t = useTranslations("WorkflowEditorPage");
  const store = useStoreApi();
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const pinnedRef = useRef(false);
  const peekActiveRef = useRef(false);
  const hoverPanelRef = useRef(false);
  const userViewportMoveRef = useRef(false);
  const prevViewportRef = useRef<Viewport | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = pinned || peek;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hidePeek = useCallback(() => {
    peekActiveRef.current = false;
    setPeek(false);
    clearHideTimer();
  }, [clearHideTimer]);

  const schedulePeekHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (!hoverPanelRef.current && !pinnedRef.current) {
        hidePeek();
      }
    }, PEEK_MS);
  }, [clearHideTimer, hidePeek]);

  const revealPeek = useCallback(() => {
    if (pinnedRef.current || hoverPanelRef.current) return;
    peekActiveRef.current = true;
    setPeek(true);
    schedulePeekHide();
  }, [schedulePeekHide]);

  useEffect(() => {
    pinnedRef.current = pinned;
    if (pinned) {
      clearHideTimer();
      peekActiveRef.current = false;
      setPeek(false);
    }
  }, [pinned, clearHideTimer]);

  useEffect(() => {
    const prevOnMoveStart = store.getState().onMoveStart;
    const prevOnMoveEnd = store.getState().onMoveEnd;

    const onMoveStart: OnMoveStart = (event, viewport) => {
      if (event != null) {
        userViewportMoveRef.current = true;
      }
      prevOnMoveStart?.(event, viewport);
    };

    const onMoveEnd: OnMoveEnd = (event, viewport) => {
      userViewportMoveRef.current = false;
      prevOnMoveEnd?.(event, viewport);
    };

    store.setState({ onMoveStart, onMoveEnd });
    return () => store.setState({ onMoveStart: prevOnMoveStart, onMoveEnd: prevOnMoveEnd });
  }, [store]);

  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      const prev = prevViewportRef.current;
      prevViewportRef.current = viewport;
      if (!prev || !userViewportMoveRef.current) return;
      if (viewportPanned(prev, viewport)) {
        revealPeek();
      }
    },
    [revealPeek],
  );

  useOnViewportChange({ onChange: onViewportChange });

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const onPanelMouseEnter = useCallback(() => {
    hoverPanelRef.current = true;
    clearHideTimer();
    if (!pinnedRef.current) {
      peekActiveRef.current = true;
      setPeek(true);
    }
  }, [clearHideTimer]);

  const onPanelMouseLeave = useCallback(() => {
    hoverPanelRef.current = false;
    if (!pinnedRef.current) {
      hidePeek();
    }
  }, [hidePeek]);

  return (
    <Panel
      position="bottom-right"
      className="!m-3 !flex !flex-col !items-end !gap-2 !p-0"
      onMouseEnter={onPanelMouseEnter}
      onMouseLeave={onPanelMouseLeave}
    >
      {visible ? (
        <div className="border-border overflow-hidden rounded-lg border shadow-sm">
          <MiniMap zoomable pannable className="!relative !m-0 !bottom-auto !right-auto" />
        </div>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "border-border bg-card/95 text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center rounded-lg border shadow-sm backdrop-blur-sm transition-colors",
              visible && "text-foreground ring-primary/40 ring-2",
            )}
            aria-label={visible ? t("minimap_hide") : t("minimap_show")}
            aria-expanded={visible}
            onClick={() => setPinned((v) => !v)}
          >
            <Map className="size-4 shrink-0" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{visible ? t("minimap_hide") : t("minimap_show")}</TooltipContent>
      </Tooltip>
    </Panel>
  );
}
