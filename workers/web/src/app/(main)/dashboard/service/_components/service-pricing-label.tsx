"use client";

import { isCfModel } from "./model-pricing";
import type { Service } from "./schema";

type TranslateFn = (key: string, params?: Record<string, string>) => string;

function formatPriceToken(value: number | undefined): string {
  return value == null ? "—" : String(value);
}

function CfPricingLabel({
  model,
  input,
  output,
  t,
}: {
  model: string;
  input: number | undefined;
  output: number | undefined;
  t: TranslateFn;
}) {
  return (
    <span>
      {t("pricing_cf", {
        model,
        input: formatPriceToken(input),
        output: formatPriceToken(output),
      })}
    </span>
  );
}

function ProxyPricingLabel({ model, service, t }: { model: string; service: Service; t: TranslateFn }) {
  return (
    <span>
      {t("pricing_proxy", {
        model,
        input: formatPriceToken(service.priceInput),
        cache: formatPriceToken(service.priceInputCache),
        output: formatPriceToken(service.priceOutput),
      })}
    </span>
  );
}

export function ServicePricingLabel({ service, t }: { service: Service; t: TranslateFn }) {
  const model = service.model?.trim();
  const profitPct = service.feePercent;
  const profitSuffix =
    profitPct !== 100 ? (
      <span className="text-muted-foreground"> · {t("pricing_profit_percent", { percent: String(profitPct) })}</span>
    ) : null;

  if (!model) {
    return (
      <span>
        {t("pricing_no_model")}
        {profitSuffix}
      </span>
    );
  }
  if (service.priceInput == null && service.priceOutput == null) {
    return (
      <span className="truncate">
        {model}
        {profitSuffix}
      </span>
    );
  }
  if (isCfModel(model)) {
    return (
      <span>
        <CfPricingLabel model={model} input={service.priceInput} output={service.priceOutput} t={t} />
        {profitSuffix}
      </span>
    );
  }
  return (
    <span>
      <ProxyPricingLabel model={model} service={service} t={t} />
      {profitSuffix}
    </span>
  );
}
