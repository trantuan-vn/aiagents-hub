"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkflowEvaluationsPanelProps {
  onAddEvaluationTrigger: () => void;
  onAddSetOutputsNode: () => void;
  onAddSetMetricsNode: () => void;
}

export function WorkflowEvaluationsPanel({
  onAddEvaluationTrigger,
  onAddSetOutputsNode,
  onAddSetMetricsNode,
}: WorkflowEvaluationsPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-6xl rounded-xl border bg-muted/20 p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">{t("evaluation_title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("evaluation_subtitle")}{" "}
              <a
                href="https://www.youtube.com/watch?v=5LlF196PKaE&t=109s"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-2"
              >
                {t("evaluation_more_info")}
              </a>
            </p>
            <div className="mt-4 overflow-hidden rounded-md border bg-black">
              <iframe
                className="aspect-video w-full"
                src="https://www.youtube.com/embed/5LlF196PKaE?start=109"
                title="n8n Evaluation quickstart"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </section>

          <section className="space-y-6 pt-1">
            <EvaluationStep
              index={1}
              title={t("evaluation_step_1_title")}
              active={activeStep === 1}
              onSelect={() => setActiveStep(1)}
            >
              {activeStep === 1 ? (
                <>
                  <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                    <li>{t("evaluation_step_1_item_1")}</li>
                    <li>{t("evaluation_step_1_item_2")}</li>
                  </ul>
                  <Button className="mt-3" variant="outline" onClick={onAddEvaluationTrigger}>
                    {t("evaluation_step_1_cta")}
                  </Button>
                </>
              ) : null}
            </EvaluationStep>

            <EvaluationStep
              index={2}
              title={t("evaluation_step_2_title")}
              active={activeStep === 2}
              onSelect={() => setActiveStep(2)}
            >
              {activeStep === 2 ? (
                <>
                  <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                    <li>{t("evaluation_step_2_item_1")}</li>
                  </ul>
                  <Button className="mt-3" variant="outline" onClick={onAddSetOutputsNode}>
                    {t("evaluation_step_2_cta")}
                  </Button>
                </>
              ) : null}
            </EvaluationStep>

            <EvaluationStep
              index={3}
              title={
                <>
                  {t("evaluation_step_3_title")}{" "}
                  <span className="text-xs font-normal">({t("evaluation_optional")})</span>
                </>
              }
              active={activeStep === 3}
              onSelect={() => setActiveStep(3)}
            >
              {activeStep === 3 ? (
                <>
                  <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                    <li>{t("evaluation_step_3_item_1")}</li>
                    <li>{t("evaluation_step_3_item_2")}</li>
                  </ul>
                  <div className="mt-3 flex items-center gap-3">
                    <Button variant="outline" onClick={onAddSetMetricsNode}>
                      {t("evaluation_step_3_cta")}
                    </Button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-sm font-medium"
                      onClick={() => setActiveStep(1)}
                    >
                      {t("evaluation_skip")}
                    </button>
                  </div>
                </>
              ) : null}
            </EvaluationStep>

            <EvaluationStep index={4} title={t("evaluation_step_4_title")} titleClassName="text-muted-foreground">
              <Button className="mt-2" variant="outline" disabled>
                {t("evaluation_step_4_cta")}
              </Button>
            </EvaluationStep>
          </section>
        </div>
      </div>
    </div>
  );
}

function EvaluationStep({
  index,
  title,
  children,
  active = false,
  titleClassName,
  onSelect,
}: {
  index: number;
  title: ReactNode;
  children?: ReactNode;
  active?: boolean;
  titleClassName?: string;
  onSelect?: () => void;
}) {
  return (
    <div className="space-y-2">
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 text-left">
        <div
          className={[
            "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
            active ? "border-amber-400 text-foreground" : "text-muted-foreground",
          ].join(" ")}
        >
          {index}
        </div>
        <p
          className={cn(
            "text-base font-medium",
            !active && "text-muted-foreground",
            active && "text-foreground",
            titleClassName,
          )}
        >
          {title}
        </p>
      </button>
      {children ? <div className="ml-11">{children}</div> : null}
    </div>
  );
}
