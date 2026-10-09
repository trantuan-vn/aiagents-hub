"use client";

import { useMemo } from "react";

import type { PromoFolderFile } from "../../../_lib/promo-folder";
import { buildPromoSrcDoc } from "../../../_lib/promo-srcdoc";

interface WorkflowPromoFrameProps {
  files: PromoFolderFile[];
  address: string;
  emptyLabel: string;
  title: string;
}

export function WorkflowPromoFrame({ files, address, emptyLabel, title }: WorkflowPromoFrameProps) {
  const srcDoc = useMemo(() => (files.length > 0 ? buildPromoSrcDoc(files) : null), [files]);

  return (
    <div className="bg-background flex h-full min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <div className="bg-muted text-muted-foreground ml-2 min-w-0 flex-1 truncate rounded-md px-3 py-1 text-xs">
          {address}
        </div>
      </div>
      {srcDoc ? (
        <iframe
          title={title}
          className="min-h-0 w-full flex-1 bg-white"
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
        />
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-6 text-center text-sm">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
