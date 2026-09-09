"use client";

import { Check, ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type WorkflowIoPanelToolbarProps = {
  showInput: boolean;
  showOutput: boolean;
  onShowInputChange: (show: boolean) => void;
  onShowOutputChange: (show: boolean) => void;
  syncWithCanvas: boolean;
  onSyncWithCanvasChange: (sync: boolean) => void;
  poppedOut: boolean;
  onPoppedOutChange: (poppedOut: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: () => void;
};

function ToggleChip({
  pressed,
  label,
  onPressedChange,
}: {
  pressed: boolean;
  label: string;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "h-6 rounded-md px-2 text-[11px] font-medium whitespace-nowrap transition-colors",
        pressed
          ? "bg-muted text-foreground"
          : "border-border text-muted-foreground hover:text-foreground border bg-background",
      )}
    >
      {label}
    </button>
  );
}

export function WorkflowIoPanelToolbar({
  showInput,
  showOutput,
  onShowInputChange,
  onShowOutputChange,
  syncWithCanvas,
  onSyncWithCanvasChange,
  poppedOut,
  onPoppedOutChange,
  collapsed,
  onCollapsedChange,
}: WorkflowIoPanelToolbarProps) {
  const t = useTranslations("WorkflowEditorPage");

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex items-center gap-1">
        <ToggleChip pressed={showInput} label={t("executions_input")} onPressedChange={onShowInputChange} />
        <ToggleChip pressed={showOutput} label={t("executions_output")} onPressedChange={onShowOutputChange} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={t("io_panel_options")}
            aria-label={t("io_panel_options")}
            className="bg-muted text-foreground hover:bg-muted/80 flex size-6 items-center justify-center rounded-md"
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onSyncWithCanvasChange(!syncWithCanvas)}>
            <span className="flex-1">{t("io_sync_canvas")}</span>
            {syncWithCanvas ? <Check className="size-3.5" aria-hidden /> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPoppedOutChange(!poppedOut)}>
            {poppedOut ? t("io_dock_panel") : t("io_pop_out")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        title={collapsed ? t("io_expand") : t("io_collapse")}
        aria-label={collapsed ? t("io_expand") : t("io_collapse")}
        aria-expanded={!collapsed}
        onClick={onCollapsedChange}
        className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md"
      >
        {collapsed ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
}
