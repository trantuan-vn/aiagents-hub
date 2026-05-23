"use client";

import { useCallback, type ReactNode } from "react";

import { Panel, useReactFlow } from "@xyflow/react";
import { Expand, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WorkflowCanvasControlsProps {
  readOnly?: boolean;
  onTidy?: () => void;
}

const controlIconClass = "size-[15px] shrink-0 stroke-[1.75]";

function ControlButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center transition-colors",
            "disabled:pointer-events-none disabled:opacity-40",
            className,
          )}
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkflowCanvasControls({ readOnly, onTidy }: WorkflowCanvasControlsProps) {
  const t = useTranslations("WorkflowEditorPage");
  const { zoomIn, zoomOut, fitView, getViewport, setViewport } = useReactFlow();

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 150 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 150 });
  }, [zoomOut]);

  const handleResetZoom = useCallback(() => {
    const { x, y } = getViewport();
    void setViewport({ x, y, zoom: 1 }, { duration: 200 });
  }, [getViewport, setViewport]);

  const handleFitView = useCallback(() => {
    void fitView({ padding: 0.2, duration: 200 });
  }, [fitView]);

  const handleTidy = useCallback(() => {
    onTidy?.();
  }, [onTidy]);

  return (
    <Panel position="bottom-left" className="!m-3 !p-0">
      <div
        className="bg-card/95 border-border flex flex-row items-center overflow-hidden rounded-lg border shadow-sm backdrop-blur-sm"
        role="toolbar"
        aria-label="Canvas zoom"
      >
        <ControlButton label={t("canvas_zoom_out")} onClick={handleZoomOut}>
          <ZoomOut className={controlIconClass} aria-hidden />
        </ControlButton>
        <ControlButton label={t("canvas_zoom_in")} onClick={handleZoomIn}>
          <ZoomIn className={controlIconClass} aria-hidden />
        </ControlButton>
        <div className="bg-border h-6 w-px shrink-0" />
        <ControlButton label={t("canvas_reset_zoom")} onClick={handleResetZoom}>
          <span className="text-[10px] font-semibold tracking-tight" aria-hidden>
            1:1
          </span>
        </ControlButton>
        <ControlButton label={t("canvas_fit_view")} onClick={handleFitView}>
          <Expand className={controlIconClass} aria-hidden />
        </ControlButton>
        {!readOnly && onTidy ? (
          <>
            <div className="bg-border h-6 w-px shrink-0" />
            <ControlButton label={t("canvas_tidy")} onClick={handleTidy}>
              <Sparkles className={controlIconClass} aria-hidden />
            </ControlButton>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
