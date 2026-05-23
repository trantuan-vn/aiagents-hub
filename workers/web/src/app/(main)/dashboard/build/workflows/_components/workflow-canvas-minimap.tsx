"use client";

import { useState } from "react";

import { MiniMap, Panel } from "@xyflow/react";
import { Map } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function WorkflowCanvasMinimap() {
  const t = useTranslations("WorkflowEditorPage");
  const [open, setOpen] = useState(false);

  return (
    <Panel position="bottom-right" className="!m-3 !flex !flex-col !items-end !gap-2 !p-0">
      {open ? (
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
              open && "text-foreground ring-primary/40 ring-2",
            )}
            aria-label={open ? t("minimap_hide") : t("minimap_show")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Map className="size-4 shrink-0" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{open ? t("minimap_hide") : t("minimap_show")}</TooltipContent>
      </Tooltip>
    </Panel>
  );
}
