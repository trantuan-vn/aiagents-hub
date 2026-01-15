"use client";

import { useEffect } from "react";

import { Zap, Shield, Globe, BarChart3, Code2, Headphones, Sparkles, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { updateThemeMode } from "@/lib/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const FeaturesSection = () => {
  const t = useTranslations("Features");
  const themeMode = usePreferencesStore((s) => s.themeMode);

  // Sync theme with document
  useEffect(() => {
    updateThemeMode(themeMode);
  }, [themeMode]);

  const features = [
    {
      icon: Zap,
      title: t("lightning_fast"),
      description: t("lightning_fast_desc"),
      color: "from-yellow-500 to-orange-500",
    },
    {
      icon: Shield,
      title: t("enterprise_security"),
      description: t("enterprise_security_desc"),
      color: "from-green-500 to-emerald-500",
    },
    {
      icon: Globe,
      title: t("global_cdn"),
      description: t("global_cdn_desc"),
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: BarChart3,
      title: t("realtime_analytics"),
      description: t("realtime_analytics_desc"),
      color: "from-purple-500 to-pink-500",
    },
    {
      icon: Code2,
      title: t("developer_first"),
      description: t("developer_first_desc"),
      color: "from-primary to-primary/70",
    },
    {
      icon: Headphones,
      title: t("support_24_7"),
      description: t("support_24_7_desc"),
      color: "from-rose-500 to-red-500",
    },
    {
      icon: Sparkles,
      title: t("ai_integration"),
      description: t("ai_integration_desc"),
      color: "from-accent to-accent/70",
    },
    {
      icon: Lock,
      title: t("rate_limiting"),
      description: t("rate_limiting_desc"),
      color: "from-slate-500 to-slate-600",
    },
  ];
  return (
    <section className="relative overflow-hidden py-24">
      {/* Background */}
      <div className="bg-muted/30 absolute inset-0" />
      <div className="bg-dots absolute inset-0" />

      <div className="relative z-10 container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="bg-accent/10 border-accent/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
            <span className="text-accent text-xs font-medium">{t("badge")}</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
          </h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* Features Grid */}
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
