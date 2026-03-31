"use client";

import { useEffect } from "react";

import NextLink from "next/link";

import { Check, ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const PackagesPreview = () => {
  const t = useTranslations("Packages");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  // Sync theme with document
  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  const packages = [
    {
      name: t("free"),
      description: t("free_desc"),
      price: "$0",
      period: t("per_month"),
      features: [
        t("features.api_calls_month", { count: "1,000" }),
        t("features.basic_analytics"),
        t("features.community_support"),
        t("features.api_key", { count: "1" }),
        t("features.standard_rate_limits"),
      ],
      cta: t("start_free"),
      href: "/auth/v3/login",
      variant: "outline" as const,
      popular: false,
    },
    {
      name: t("basic"),
      description: t("basic_desc"),
      price: "$49",
      period: t("per_month"),
      features: [
        t("features.api_calls_month", { count: "100,000" }),
        t("features.advanced_analytics"),
        t("features.priority_support"),
        t("features.api_key", { count: "5" }),
        t("features.higher_rate_limits"),
        t("features.webhooks"),
        t("features.custom_domains"),
      ],
      cta: t("get_started"),
      href: "/auth/v3/login",
      variant: "gradient" as const,
      popular: true,
    },
    {
      name: t("enterprise"),
      description: t("enterprise_desc"),
      price: "$149",
      period: t("per_month"),
      features: [
        t("features.unlimited_api_calls"),
        t("features.realtime_analytics"),
        t("features.dedicated_support"),
        t("features.unlimited_api_keys"),
        t("features.custom_rate_limits"),
        t("features.sla_guarantee"),
        t("features.on_premise_option"),
        t("features.custom_integrations"),
      ],
      cta: t("contact_sales"),
      href: "/auth/v3/login",
      variant: "outline" as const,
      popular: false,
    },
  ];
  return (
    <section className="relative py-24">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="bg-primary/10 border-primary/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
            <span className="text-primary text-xs font-medium">{t("badge")}</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* Pricing Cards */}
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              className={`card-hover relative rounded-2xl border p-8 transition-all duration-300 ${
                pkg.popular
                  ? "bg-card border-primary z-10 scale-105 shadow-xl"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="from-primary to-accent bg-gradient-to-r px-4 py-1 text-white shadow-lg">
                    <Sparkles className="mr-1 h-3 w-3" />
                    {t("most_popular")}
                  </Badge>
                </div>
              )}

              <div className="mb-6 text-center">
                <h3 className="mb-2 text-xl font-semibold">{pkg.name}</h3>
                <p className="text-muted-foreground mb-4 text-sm">{pkg.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{pkg.price}</span>
                  <span className="text-muted-foreground">{pkg.period}</span>
                </div>
              </div>

              <ul className="mb-8 space-y-3">
                {pkg.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="text-accent mt-0.5 h-5 w-5 shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button variant={pkg.variant} className="w-full" asChild>
                <NextLink href={pkg.href}>{pkg.cta}</NextLink>
              </Button>
            </div>
          ))}
        </div>

        {/* View All Link */}
        <div className="mt-12 text-center">
          <Link to="/packages">
            <Button variant="ghost" className="group">
              {t("view_all_packages")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default PackagesPreview;
