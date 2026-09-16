"use client";

import type { Service } from "./schema";

type TranslateFn = (key: string, params?: Record<string, string>) => string;

function familyOf(model: string): string {
  const id = model.toLowerCase();
  if (id.includes("claude") || id.includes("anthropic")) return "Claude";
  if (/gpt|openai|^o[1-4]/.test(id)) return "GPT";
  if (id.includes("gemini") || id.includes("google")) return "Gemini";
  if (id.includes("llama") || id.includes("meta")) return "Llama";
  if (id.startsWith("@cf")) return "Workers AI";
  return model;
}

function estimatedCredits(service: Service): number | null {
  if (typeof service.estimatedCreditsPerRun === "number" && Number.isFinite(service.estimatedCreditsPerRun)) {
    return service.estimatedCreditsPerRun;
  }
  const input = Number(service.creditCoeffInput);
  const output = Number(service.creditCoeffOutput ?? 0);
  if (!Number.isFinite(input) || input < 0) return null;
  return Math.ceil(((1000 * input + 500 * Math.max(0, output)) / 1_000_000) * 10_000) / 10_000;
}

export function ServicePricingLabel({ service, t }: { service: Service; t: TranslateFn }) {
  const model = service.model?.trim();
  const label = service.modelFamily?.trim() || (model ? familyOf(model) : "");
  const credits = estimatedCredits(service);
  if (!model) {
    return <span>{t("pricing_no_model")}</span>;
  }
  if (credits != null && credits > 0) {
    return (
      <span>
        {t("pricing_credits", { model: label, credits: String(credits) })}
      </span>
    );
  }
  return <span>{t("pricing_credits_unknown", { model: label })}</span>;
}