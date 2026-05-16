"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { type Control, useFormContext, useWatch } from "react-hook-form";

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import {
  applyModelPricesToForm,
  clearModelPricing,
  clearModelPricingErrors,
  isCfModel,
  isProxyModel,
  isValidPriceDraft,
  normalizePriceDraft,
  parsePriceFieldValue,
  priceInputDisplayValue,
  revalidateModelPricing,
  resolveModelHit,
  type ModelSearchHit,
} from "./model-pricing";
import { ModelSearchInput } from "./model-search-input";
import type { ServiceFormValues } from "./schema";

const PricingFieldContext = createContext<{ skipBlurCommitRef: React.RefObject<boolean> } | null>(null);

function PriceField({
  control,
  name,
  label,
  description,
  disabled,
}: {
  control: Control<ServiceFormValues>;
  name: "priceInput" | "priceOutput" | "priceInputCache";
  label: string;
  description: string;
  disabled?: boolean;
}) {
  const form = useFormContext<ServiceFormValues>();
  const pricingCtx = useContext(PricingFieldContext);
  const skipBlurCommitRef = pricingCtx?.skipBlurCommitRef;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <PriceFieldInput
          field={field}
          form={form}
          skipBlurCommitRef={skipBlurCommitRef}
          name={name}
          label={label}
          description={description}
          disabled={disabled}
        />
      )}
    />
  );
}

function PriceFieldInput({
  field,
  form,
  skipBlurCommitRef,
  name,
  label,
  description,
  disabled,
}: {
  field: {
    value: ServiceFormValues["priceInput"];
    onChange: (v: number | string | null | undefined) => void;
    onBlur: () => void;
    name: string;
  };
  form: ReturnType<typeof useFormContext<ServiceFormValues>>;
  skipBlurCommitRef?: React.RefObject<boolean>;
  name: string;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(() => priceInputDisplayValue(field.value));

  useEffect(() => {
    setDraft(priceInputDisplayValue(field.value));
  }, [field.value]);

  const commitPrice = (): void => {
    const parsed = parsePriceFieldValue(draft);
    field.onChange(parsed ?? null);
    revalidateModelPricing(form);
  };

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <Input
          type="text"
          inputMode="decimal"
          lang="en"
          autoComplete="off"
          disabled={disabled}
          placeholder=""
          name={name}
          value={draft}
          onChange={(e) => {
            const next = normalizePriceDraft(e.target.value);
            if (!isValidPriceDraft(next)) return;
            setDraft(next);
            field.onChange(next === "" ? null : next);
          }}
          onBlur={() => {
            field.onBlur();
            if (skipBlurCommitRef?.current) return;
            commitPrice();
          }}
        />
      </FormControl>
      <FormDescription>{description}</FormDescription>
      <FormMessage />
    </FormItem>
  );
}

export function ServiceModelPricingFields({ control }: { control: Control<ServiceFormValues> }) {
  const t = useTranslations("ServicePage");
  const form = useFormContext<ServiceFormValues>();
  const model = useWatch({ control, name: "model" });
  const showCf = isCfModel(model);
  const showProxy = isProxyModel(model);

  const pricingFillGen = useRef(0);
  const skipBlurCommitRef = useRef(false);

  const applyModelSelection = async (hit: ModelSearchHit): Promise<void> => {
    const gen = ++pricingFillGen.current;
    const modelId = hit.id.trim();
    skipBlurCommitRef.current = true;
    form.setValue("model", modelId, { shouldValidate: false, shouldDirty: true });

    if (!isCfModel(modelId)) {
      clearModelPricing(form);
      clearModelPricingErrors(form);
      queueMicrotask(() => {
        skipBlurCommitRef.current = false;
      });
      return;
    }

    const resolved =
      hit.priceInput !== undefined && hit.priceOutput !== undefined ? hit : await resolveModelHit(modelId);
    if (gen !== pricingFillGen.current) return;

    skipBlurCommitRef.current = true;
    applyModelPricesToForm(form, resolved);
    queueMicrotask(() => {
      skipBlurCommitRef.current = false;
    });
  };

  const modelForPricing = model?.trim() ?? "";
  const pricingFieldContextValue = useMemo(() => ({ skipBlurCommitRef }), []);

  return (
    <PricingFieldContext.Provider value={pricingFieldContextValue}>
      <>
        <FormField
          control={control}
          name="feePercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("form.profit_percent")}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  inputMode="decimal"
                  lang="en"
                  autoComplete="off"
                  placeholder="100"
                  value={priceInputDisplayValue(field.value ?? 100)}
                  onChange={(e) => {
                    const draft = normalizePriceDraft(e.target.value);
                    if (!isValidPriceDraft(draft)) return;
                    field.onChange(draft === "" ? null : draft);
                  }}
                  onBlur={() => {
                    const parsed = parsePriceFieldValue(String(field.value ?? ""));
                    field.onChange(parsed ?? 100);
                  }}
                />
              </FormControl>
              <FormDescription>{t("form.profit_percent_description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="model"
          render={() => (
            <FormItem>
              <FormLabel>{t("form.model")}</FormLabel>
              <FormControl>
                <ModelSearchInput value={model} onChange={applyModelSelection} />
              </FormControl>
              <FormDescription>{t("form.model_description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {(showCf || showProxy) && (
          <div key={modelForPricing} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PriceField
              control={control}
              name="priceInput"
              label={t("form.price_input")}
              description={t("form.price_per_million")}
            />
            {showProxy && (
              <PriceField
                control={control}
                name="priceInputCache"
                label={t("form.price_input_cache")}
                description={t("form.price_per_million")}
              />
            )}
            <PriceField
              control={control}
              name="priceOutput"
              label={t("form.price_output")}
              description={t("form.price_per_million")}
            />
          </div>
        )}
      </>
    </PricingFieldContext.Provider>
  );
}
