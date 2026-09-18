"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";

import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { PlanCatalog } from "../packages/plan-catalog";

const PackagesPreview = () => {
  const t = useTranslations("Packages");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  return (
    <section className="relative py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="bg-primary/10 border-primary/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
            <span className="text-primary text-xs font-medium">{t("badge")}</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <PlanCatalog compact />
      </div>
    </section>
  );
};

export default PackagesPreview;
