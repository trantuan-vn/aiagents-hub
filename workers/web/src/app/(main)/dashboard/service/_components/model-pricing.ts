import type { UseFormReturn } from "react-hook-form";

import type { ServiceFormValues } from "./schema";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

export function isCfModel(model: string | undefined | null): boolean {
  return Boolean(model?.startsWith("@cf"));
}

export function isProxyModel(model: string | undefined | null): boolean {
  return Boolean(model?.trim() && !isCfModel(model));
}

/** Always use dot for display/parsing (avoid vi-VN comma in type=number inputs). */
export function formatPriceFieldValue(value: number | string | null | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  const n = typeof value === "number" ? value : parsePriceFieldValue(String(value));
  if (n === undefined) return "";
  return String(n);
}

export function normalizePriceDraft(raw: string): string {
  return raw.replace(/\s/g, "").replace(",", ".");
}

/** Allow digits and a single decimal point while typing (e.g. "0.", ".5"). */
export function isValidPriceDraft(raw: string): boolean {
  return raw === "" || /^\d*\.?\d*$/.test(raw);
}

export function parsePriceFieldValue(raw: string): number | undefined {
  const normalized = normalizePriceDraft(raw.trim());
  if (normalized === "" || normalized === ".") return undefined;
  const n = parseFloat(normalized);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

export function priceInputDisplayValue(value: number | string | null | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  return formatPriceFieldValue(value);
}

export type ModelSearchHit = {
  id: string;
  name?: string;
  description?: string;
  source?: string;
  priceInput?: number;
  priceOutput?: number;
  priceInputCache?: number;
};

export async function searchModelHits(query: string): Promise<ModelSearchHit[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("search", query.trim());
  const res = await fetch(`${API_BASE_URL}/dashboard/admin/service/models/search?${params}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as ModelSearchHit[]) : [];
}

/** Resolve pricing from hub model search (CF properties[property_id=price]). */
export async function resolveModelHit(modelId: string): Promise<ModelSearchHit> {
  const trimmed = modelId.trim();
  if (!trimmed) return { id: "" };
  const hits = await searchModelHits(trimmed);
  return hits.find((h) => h.id === trimmed) ?? hits[0] ?? { id: trimmed };
}

const setPriceOpts = { shouldDirty: true, shouldValidate: false } as const;

export function clearModelPricing(form: UseFormReturn<ServiceFormValues>): void {
  form.setValue("priceInput", null, setPriceOpts);
  form.setValue("priceOutput", null, setPriceOpts);
  form.setValue("priceInputCache", null, setPriceOpts);
}

export function clearModelPricingErrors(form: UseFormReturn<ServiceFormValues>): void {
  form.clearErrors(["priceInput", "priceOutput", "priceInputCache"]);
}

/** Clears previous model prices, then applies pricing from the selected hit (if any). */
export function applyModelPricesToForm(form: UseFormReturn<ServiceFormValues>, hit: ModelSearchHit): void {
  clearModelPricing(form);

  if (hit.priceInput !== undefined) {
    form.setValue("priceInput", hit.priceInput, setPriceOpts);
  }
  if (hit.priceOutput !== undefined) {
    form.setValue("priceOutput", hit.priceOutput, setPriceOpts);
  }
  if (hit.priceInputCache !== undefined) {
    form.setValue("priceInputCache", hit.priceInputCache, setPriceOpts);
  }

  void form.trigger(["model", "priceInput", "priceOutput", "priceInputCache"]);
}

export function revalidateModelPricing(form: UseFormReturn<ServiceFormValues>): void {
  void form.trigger(["model", "priceInput", "priceOutput", "priceInputCache"]);
}
