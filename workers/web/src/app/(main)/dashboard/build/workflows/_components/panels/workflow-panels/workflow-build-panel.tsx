"use client";

import { useState } from "react";

import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { generateWorkflow, type GeneratedWorkflow } from "../../../_lib/api";

interface WorkflowBuildPanelProps {
  onApplyDefinition: (definitionJson: string) => void;
}

const EXAMPLES_KEYS = ["ai_example_1", "ai_example_2", "ai_example_3"] as const;

export function WorkflowBuildPanel({ onApplyDefinition }: WorkflowBuildPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeneratedWorkflow | null>(null);

  const onGenerate = async () => {
    const clean = prompt.trim();
    if (!clean) return;
    setBusy(true);
    setResult(null);
    try {
      const generated = await generateWorkflow(clean);
      setResult(generated);
      const def = generated.definition;
      onApplyDefinition(JSON.stringify(def));
      toast.success(
        t("ai_build_applied", {
          nodes: def.nodes.length,
          edges: def.edges.length,
        }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ai_build_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <p className="text-muted-foreground text-sm leading-relaxed">{t("ai_build_description")}</p>

      <div className="space-y-2">
        <label htmlFor="workflow-ai-prompt" className="text-foreground text-xs font-medium">
          {t("ai_prompt_label")}
        </label>
        <Textarea
          id="workflow-ai-prompt"
          className="min-h-[140px] resize-none rounded-lg border-border/80 bg-muted/30 text-sm shadow-none focus-visible:bg-background"
          placeholder={t("ai_placeholder_build")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{t("ai_examples_label")}</p>
        <div className="flex flex-col gap-1.5">
          {EXAMPLES_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => setPrompt(t(key))}
              className={cn(
                "border-border/80 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors disabled:opacity-50",
              )}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => void onGenerate()}
        disabled={busy || !prompt.trim()}
        className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
        {busy ? t("ai_build_generating") : t("ai_build_generate")}
      </Button>

      {result ? (
        <div
          className="border-emerald-500/20 bg-emerald-500/5 space-y-2 rounded-lg border p-3.5"
          role="status"
        >
          <p className="text-foreground flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {t("ai_build_done")}
          </p>
          {result.notes ? <p className="text-muted-foreground text-xs leading-relaxed">{result.notes}</p> : null}
          <p className="text-muted-foreground text-xs tabular-nums">
            {t("ai_build_summary", {
              nodes: result.definition.nodes.length,
              edges: result.definition.edges.length,
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
