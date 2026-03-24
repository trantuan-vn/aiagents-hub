"use client";

import { useState } from "react";

import { type LucideIcon, Bot, Brain, Check, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import Layout from "../components/layout/main-layout";

type Tier = "free" | "basic" | "pro";

type PackageEntry = {
  id: number;
  name: string;
  description: string;
  icon: LucideIcon;
  category: string;
  pricing: {
    free: { calls: number; price: number };
    basic: { calls: number; price: number };
    pro: { calls: number; price: number };
  };
  features: string[];
  popular: boolean;
  comingSoon?: boolean;
};

function tierPricing(tier: Tier, pricing: PackageEntry["pricing"]) {
  if (tier === "free") return pricing.free;
  if (tier === "basic") return pricing.basic;
  return pricing.pro;
}

function PackageCard({
  pkg,
  selectedTier,
  categories,
  t,
}: {
  pkg: PackageEntry;
  selectedTier: Tier;
  categories: { value: string; label: string }[];
  t: ReturnType<typeof useTranslations<"PackagesPage">>;
}) {
  const tier = tierPricing(selectedTier, pkg.pricing);

  return (
    <div
      className={`bg-card card-hover relative rounded-2xl border p-6 transition-all duration-300 ${
        pkg.popular ? "border-primary shadow-lg" : "border-border hover:border-primary/50"
      }`}
    >
      {pkg.popular && (
        <Badge className="from-primary to-accent absolute -top-3 right-4 bg-gradient-to-r text-white">
          {t("popular")}
        </Badge>
      )}
      {pkg.comingSoon && (
        <Badge
          className="absolute -top-3 right-4 border border-cyan-400/40 bg-gradient-to-r from-slate-950 via-cyan-950/90 to-violet-950 text-[11px] font-semibold tracking-wide text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.35)]"
          variant="outline"
        >
          <Sparkles className="h-3 w-3 text-cyan-300" aria-hidden />
          {t("coming_soon")}
        </Badge>
      )}

      <div className="mb-4 flex items-start gap-4">
        <div className="from-primary/20 to-accent/20 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br">
          <pkg.icon className="text-primary h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 text-lg font-semibold">{pkg.name}</h3>
          <Badge variant="outline" className="text-xs capitalize">
            {categories.find((cat) => cat.value === pkg.category)?.label ?? pkg.category}
          </Badge>
        </div>
      </div>

      <p className="text-muted-foreground mb-4 text-sm leading-relaxed">{pkg.description}</p>

      <div className="bg-muted/50 mb-4 rounded-xl p-4">
        <div className="mb-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold">${tier.price}</span>
          <span className="text-muted-foreground text-sm">{t("per_month")}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          {tier.calls.toLocaleString()} {t("api_calls")}
        </p>
      </div>

      <ul className="mb-6 space-y-2">
        {pkg.features.slice(0, 3).map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-sm">
            <Check className="text-accent h-4 w-4" />
            {feature}
          </li>
        ))}
        {pkg.features.length > 3 && (
          <li className="text-muted-foreground text-xs">{t("more_features", { count: pkg.features.length - 3 })}</li>
        )}
      </ul>

      <div className="flex gap-2">
        <Link to={`/packages/${pkg.id}`} className="flex-1">
          <Button variant="outline" className="w-full">
            {t("learn_more")}
          </Button>
        </Link>
        <Link to="/auth?mode=signup">
          <Button variant="default">{t("subscribe")}</Button>
        </Link>
      </div>
    </div>
  );
}

const Packages = () => {
  const t = useTranslations("PackagesPage");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTier, setSelectedTier] = useState<"free" | "basic" | "pro">("basic");

  const categories = [
    { value: "all", label: t("all_categories") },
    { value: "ai", label: t("ai_ml") },
    { value: "claw", label: t("claw") },
  ];

  const apiPackages: PackageEntry[] = [
    {
      id: 1,
      name: t("packages.ai_vision.name"),
      description: t("packages.ai_vision.description"),
      icon: Brain,
      category: "ai",
      pricing: {
        free: { calls: 500, price: 0 },
        basic: { calls: 25000, price: 49 },
        pro: { calls: 250000, price: 149 },
      },
      features: [
        t("packages.ai_vision.features.0"),
        t("packages.ai_vision.features.1"),
        t("packages.ai_vision.features.2"),
        t("packages.ai_vision.features.3"),
      ],
      popular: true,
    },
    {
      id: 2,
      name: t("packages.claw_api.name"),
      description: t("packages.claw_api.description"),
      icon: Bot,
      category: "claw",
      pricing: {
        free: { calls: 1000, price: 0 },
        basic: { calls: 40000, price: 39 },
        pro: { calls: 400000, price: 119 },
      },
      features: [
        t("packages.claw_api.features.0"),
        t("packages.claw_api.features.1"),
        t("packages.claw_api.features.2"),
        t("packages.claw_api.features.3"),
      ],
      popular: false,
      comingSoon: true,
    },
  ];

  const filteredPackages = apiPackages.filter((pkg) => {
    const matchesSearch =
      pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || pkg.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Layout>
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <div className="bg-primary/10 border-primary/20 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1">
              <Sparkles className="text-primary h-4 w-4" />
              <span className="text-primary text-xs font-medium">{t("badge")}</span>
            </div>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              {t("title")} <span className="gradient-text">{t("title_gradient")}</span>
            </h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
          </div>

          {/* Filters */}
          <div className="mb-8 flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
              <Input
                placeholder={t("search_placeholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t("category")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tier Toggle */}
          <div className="mb-12 flex items-center justify-center gap-2">
            <span className="text-muted-foreground text-sm">{t("compare_plans")}</span>
            <div className="bg-muted flex rounded-lg p-1">
              {(["free", "basic", "pro"] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    selectedTier === tier
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Packages Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPackages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} selectedTier={selectedTier} categories={categories} t={t} />
            ))}
          </div>

          {filteredPackages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">{t("no_packages_found")}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Packages;
