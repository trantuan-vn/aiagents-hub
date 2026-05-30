"use client";

import { useState } from "react";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { generateWorkflow, type GeneratedWorkflow } from "../_lib/api";

interface WorkflowBuildPanelProps {
  workflowId: number;
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-muted-foreground space-y-1 text-xs">
        <p className="text-foreground flex items-center gap-1.5 text-sm font-medium">
          <Wand2 className="size-4 text-violet-600 dark:text-violet-400" />
          {t("ai_build_title")}
        </p>
        <p className="leading-relaxed">{t("ai_build_description")}</p>
      </div>

      <Textarea
        className="min-h-[120px] resize-none rounded-xl text-sm"
        placeholder={t("ai_placeholder_build")}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
      />

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => setPrompt(t(key))}
            className="border-border text-muted-foreground hover:bg-muted rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50"
          >
            {t(key)}
          </button>
        ))}
      </div>

      <Button
        type="button"
        onClick={() => void onGenerate()}
        disabled={busy || !prompt.trim()}
        className="bg-[#ff6f00] text-white hover:bg-[#e66300]"
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
        {busy ? t("ai_build_generating") : t("ai_build_generate")}
      </Button>

      {result ? (
        <div className="border-border bg-muted/40 mt-1 space-y-1 rounded-lg border p-3 text-xs">
          <p className="text-foreground font-medium">{t("ai_build_done")}</p>
          {result.notes ? <p className="text-muted-foreground leading-relaxed">{result.notes}</p> : null}
          <p className="text-muted-foreground">
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
