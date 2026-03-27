"use client";

import { Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ActivityStep } from "./ask-ai-steps";

export function AskAiInlineActivity({ steps, wsConnected }: { steps: ActivityStep[]; wsConnected: boolean }) {
  return (
    <div className="border-border/50 bg-card/80 flex w-full min-w-0 flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="text-primary size-4 shrink-0" />
        <span className="text-foreground text-sm font-medium">Hệ thống đang xử lý</span>
        {wsConnected ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <span className="inline-flex size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            Cập nhật theo thời gian thực
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Theo dõi các bước bên dưới</span>
        )}
      </div>

      {steps.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>Đang chuẩn bị…</span>
        </div>
      ) : (
        <ol className="border-border/70 relative ml-1 space-y-0 border-l pl-4">
          {steps.map((step, i) => (
            <li key={`${step.id}-${step.at}`} className="pb-4 last:pb-0">
              <span
                className={cn(
                  "border-background absolute -left-[5px] mt-1 size-2.5 rounded-full border-2",
                  step.status === "done" && "bg-emerald-500",
                  step.status === "running" && "border-primary bg-primary animate-pulse",
                  step.status === "error" && "bg-destructive",
                  step.status === "pending" && "bg-muted-foreground/40",
                )}
              />
              <div className="flex flex-col gap-0.5 pl-1">
                <span className="text-muted-foreground/80 text-[10px] font-medium tracking-wide uppercase">
                  Bước {i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm leading-snug",
                    step.status === "running" && "text-foreground font-medium",
                    step.status === "done" && "text-muted-foreground",
                    step.status === "error" && "text-destructive",
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
