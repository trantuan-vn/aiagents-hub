"use client";

import { useEffect } from "react";

import { BarChart3, Coins, Headphones, Share2, Sparkles, Webhook, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const FeaturesSection = () => {
  const t = useTranslations("Features");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  const features = [
    {
      icon: Workflow,
      title: t("workflow_builder"),
      description: t("workflow_builder_desc"),
      color: "from-violet-500 to-indigo-500",
    },
    {
      icon: Sparkles,
      title: t("agents_rag"),
      description: t("agents_rag_desc"),
      color: "from-accent to-accent/70",
    },
    {
      icon: Coins,
      title: t("one_credit"),
      description: t("one_credit_desc"),
      color: "from-amber-500 to-orange-500",
    },
    {
      icon: Zap,
      title: t("unlimited_models"),
      description: t("unlimited_models_desc"),
      color: "from-yellow-500 to-orange-500",
    },
    {
      icon: Webhook,
      title: t("webhooks_cron"),
      description: t("webhooks_cron_desc"),
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: Share2,
      title: t("sharing_royalty"),
      description: t("sharing_royalty_desc"),
      color: "from-green-500 to-emerald-500",
    },
    {
      icon: BarChart3,
      title: t("usage_visibility"),
      description: t("usage_visibility_desc"),
      color: "from-purple-500 to-pink-500",
    },
    {
      icon: Headphones,
      title: t("support_levels"),
      description: t("support_levels_desc"),
      color: "from-rose-500 to-red-500",
    },
  ];

  return (
    <section className="relative overflow-hidden py-24">
      <div className="bg-muted/30 absolute inset-0" />
      <div className="bg-dots absolute inset-0" />

      <div className="relative z-10 container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="bg-accent/10 border-accent/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
            <span className="text-accent text-xs font-medium">{t("badge")}</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="bg-card border-border hover:border-primary/50 card-hover group rounded-2xl border p-6 transition-all duration-300"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div
                className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.color} mb-4 flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}
              >
                <feature.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
