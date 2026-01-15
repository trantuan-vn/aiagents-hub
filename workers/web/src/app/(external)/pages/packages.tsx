"use client";

import { useState } from "react";

import { Check, Search, Sparkles, Zap, Database, Brain, Globe, Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import Layout from "../components/layout/main-layout";

const Packages = () => {
  const t = useTranslations("PackagesPage");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTier, setSelectedTier] = useState<"free" | "basic" | "pro">("basic");

  const categories = [
    { value: "all", label: t("all_categories") },
    { value: "ai", label: t("ai_ml") },
    { value: "data", label: t("data_processing") },
    { value: "utility", label: t("utilities") },
    { value: "security", label: t("security") },
  ];

  const apiPackages = [
    {
      id: 1,
      name: t("packages.data_processing.name"),
      description: t("packages.data_processing.description"),
      icon: Database,
      category: "data",
      pricing: {
        free: { calls: 1000, price: 0 },
        basic: { calls: 50000, price: 29 },
        pro: { calls: 500000, price: 99 },
      },
      features: [
        t("packages.data_processing.features.0"),
        t("packages.data_processing.features.1"),
        t("packages.data_processing.features.2"),
        t("packages.data_processing.features.3"),
      ],
      popular: false,
    },
    {
      id: 2,
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
      id: 3,
      name: t("packages.geolocation.name"),
      description: t("packages.geolocation.description"),
      icon: Globe,
      category: "utility",
      pricing: {
        free: { calls: 2000, price: 0 },
        basic: { calls: 100000, price: 19 },
        pro: { calls: 1000000, price: 79 },
      },
      features: [
        t("packages.geolocation.features.0"),
        t("packages.geolocation.features.1"),
        t("packages.geolocation.features.2"),
        t("packages.geolocation.features.3"),
      ],
      popular: false,
    },
    {
      id: 4,
      name: t("packages.authentication.name"),
      description: t("packages.authentication.description"),
      icon: Shield,
      category: "security",
      pricing: {
        free: { calls: 1000, price: 0 },
        basic: { calls: 50000, price: 39 },
        pro: { calls: 500000, price: 129 },
      },
      features: [
        t("packages.authentication.features.0"),
        t("packages.authentication.features.1"),
        t("packages.authentication.features.2"),
        t("packages.authentication.features.3"),
      ],
      popular: true,
    },
    {
      id: 5,
      name: t("packages.natural_language.name"),
      description: t("packages.natural_language.description"),
      icon: Brain,
      category: "ai",
      pricing: {
        free: { calls: 500, price: 0 },
        basic: { calls: 30000, price: 59 },
        pro: { calls: 300000, price: 179 },
      },
      features: [
        t("packages.natural_language.features.0"),
        t("packages.natural_language.features.1"),
        t("packages.natural_language.features.2"),
        t("packages.natural_language.features.3"),
      ],
      popular: false,
    },
    {
      id: 6,
      name: t("packages.realtime_events.name"),
      description: t("packages.realtime_events.description"),
      icon: Zap,
      category: "utility",
      pricing: {
        free: { calls: 5000, price: 0 },
        basic: { calls: 100000, price: 35 },
        pro: { calls: 1000000, price: 99 },
      },
      features: [
        t("packages.realtime_events.features.0"),
        t("packages.realtime_events.features.1"),
        t("packages.realtime_events.features.2"),
        t("packages.realtime_events.features.3"),
      ],
      popular: false,
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
              <div
                key={pkg.id}
                className={`bg-card card-hover relative rounded-2xl border p-6 transition-all duration-300 ${
                  pkg.popular ? "border-primary shadow-lg" : "border-border hover:border-primary/50"
                }`}
              >
                {pkg.popular && (
                  <Badge className="from-primary to-accent absolute -top-3 right-4 bg-gradient-to-r text-white">
                    {t("popular")}
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

                <p className="text-muted-foreground mb-4 line-clamp-2 text-sm">{pkg.description}</p>

                <div className="bg-muted/50 mb-4 rounded-xl p-4">
                  <div className="mb-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">
                      $
                      {selectedTier === "free"
                        ? pkg.pricing.free.price
                        : selectedTier === "basic"
                          ? pkg.pricing.basic.price
                          : pkg.pricing.pro.price}
                    </span>
                    <span className="text-muted-foreground text-sm">{t("per_month")}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {(selectedTier === "free"
                      ? pkg.pricing.free.calls
                      : selectedTier === "basic"
                        ? pkg.pricing.basic.calls
                        : pkg.pricing.pro.calls
                    ).toLocaleString()}{" "}
                    {t("api_calls")}
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
                    <li className="text-muted-foreground text-xs">
                      {t("more_features", { count: pkg.features.length - 3 })}
                    </li>
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
