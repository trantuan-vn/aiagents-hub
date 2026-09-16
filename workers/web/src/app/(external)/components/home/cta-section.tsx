"use client";

import { useEffect } from "react";

import NextLink from "next/link";

import { ArrowRight, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link as RouterLink } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const CTASection = () => {
  const t = useTranslations("CTA");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  return (
    <section className="relative overflow-hidden py-24">
      <div className="from-primary/10 via-background to-accent/10 absolute inset-0 bg-gradient-to-br" />
      <div className="bg-grid absolute inset-0 opacity-30" />

      <div className="bg-primary/20 absolute top-0 left-1/4 h-72 w-72 rounded-full blur-3xl" />
      <div className="bg-accent/20 absolute right-1/4 bottom-0 h-72 w-72 rounded-full blur-3xl" />

      <div className="relative z-10 container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-5xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h2>
          <p className="text-muted-foreground mx-auto mb-10 max-w-xl text-lg">{t("subtitle")}</p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button variant="default" size="default" asChild>
              <NextLink href="/auth/v3/login">
                {t("get_started_free")}
                <ArrowRight className="h-5 w-5" />
              </NextLink>
            </Button>
            <RouterLink to="/contact">
              <Button variant="outline" size="lg">
                <MessageCircle className="h-5 w-5" />
                {t("talk_to_sales")}
              </Button>
            </RouterLink>
          </div>

          <p className="text-muted-foreground mt-12 text-sm">{t("trusted_by")}</p>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
