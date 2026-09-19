"use client";

import { useEffect, useMemo, useState } from "react";

import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";

export type PublicPlan = {
  planId: "free" | "starter" | "pro" | "business";
  listPriceUsdPerMonth: number;
  prices: Record<string, { chargeUsd: number; usdPerMonth: number } | null>;
  includedCredits: number;
  workflowRunsPerDay: number;
  maxCronJobs: number;
  canBuyCredits: boolean;
  canShareWorkflows: boolean;
  canUseWebhooks: boolean;
  canGraceWhenExhausted: boolean;
  popular: boolean;
};

export type PublicCatalog = {
  billingEnabled: boolean;
  intervals: number[];
  discounts: Record<string, number>;
  plans: PublicPlan[];
};

const FALLBACK: PublicCatalog = {
  billingEnabled: true,
  intervals: [1, 3, 6, 12],
  discounts: { 1: 0, 3: 0.1, 6: 0.15, 12: 0.2 },
  plans: [
    {
      planId: "free",
      listPriceUsdPerMonth: 0,
      prices: { "1": null, "3": null, "6": null, "12": null },
      includedCredits: 150,
      workflowRunsPerDay: 15,
      maxCronJobs: 0,
      canBuyCredits: false,
      canShareWorkflows: false,
      canUseWebhooks: false,
      canGraceWhenExhausted: false,
      popular: false,
    },
    {
      planId: "starter",
      listPriceUsdPerMonth: 4.9,
      prices: {
        "1": { chargeUsd: 4.9, usdPerMonth: 4.9 },
        "3": { chargeUsd: 13.23, usdPerMonth: 4.41 },
        "6": { chargeUsd: 24.99, usdPerMonth: 4.17 },
        "12": { chargeUsd: 47.04, usdPerMonth: 3.92 },
      },
      includedCredits: 500,
      workflowRunsPerDay: 50,
      maxCronJobs: 3,
      canBuyCredits: true,
      canShareWorkflows: true,
      canUseWebhooks: true,
      canGraceWhenExhausted: true,
      popular: false,
    },
    {
      planId: "pro",
      listPriceUsdPerMonth: 19.9,
      prices: {
        "1": { chargeUsd: 19.9, usdPerMonth: 19.9 },
        "3": { chargeUsd: 53.73, usdPerMonth: 17.91 },
        "6": { chargeUsd: 101.49, usdPerMonth: 16.92 },
        "12": { chargeUsd: 191.04, usdPerMonth: 15.92 },
      },
      includedCredits: 2000,
      workflowRunsPerDay: 200,
      maxCronJobs: 15,
      canBuyCredits: true,
      canShareWorkflows: true,
      canUseWebhooks: true,
      canGraceWhenExhausted: true,
      popular: true,
    },
    {
      planId: "business",
      listPriceUsdPerMonth: 99.9,
      prices: {
        "1": { chargeUsd: 99.9, usdPerMonth: 99.9 },
        "3": { chargeUsd: 269.73, usdPerMonth: 89.91 },
        "6": { chargeUsd: 509.49, usdPerMonth: 84.92 },
        "12": { chargeUsd: 959.04, usdPerMonth: 79.92 },
      },
      includedCredits: 10000,
      workflowRunsPerDay: 1000,
      maxCronJobs: 100,
      canBuyCredits: true,
      canShareWorkflows: true,
      canUseWebhooks: true,
      canGraceWhenExhausted: true,
      popular: false,
    },
  ],
};

const PLAN_RANK: Record<PublicPlan["planId"], number> = { free: 0, starter: 1, pro: 2, business: 3 };

function loginRedirect(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://aiagents-hub.vn";
  return `/auth/v3/login?redirect=${encodeURIComponent(`${origin}${path}`)}`;
}

function formatUsd(n: number): string {
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

export function PlanCatalog({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Packages");
  const [catalog, setCatalog] = useState<PublicCatalog>(FALLBACK);
  const [interval, setInterval] = useState<1 | 3 | 6 | 12>(1);
  const [planId, setPlanId] = useState<PublicPlan["planId"] | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    void fetch(`${API_BASE}/public/plans`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        const catalog = json as PublicCatalog | null;
        if (catalog && Array.isArray(catalog.plans) && catalog.plans.length === 4) setCatalog(catalog);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch(`${AUTH_API}/profile/me`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        setLoggedIn(true);
        const me = (await r.json()) as { planId?: string };
        if (me.planId === "starter" || me.planId === "pro" || me.planId === "business" || me.planId === "free") {
          setPlanId(me.planId);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const wanted = searchParams.get("checkout");
    if (wanted === "cancelled") {
      setCancelled(true);
      return;
    }
    const iv = Number(searchParams.get("interval") ?? 1);
    if (wanted === "starter" || wanted === "pro" || wanted === "business") {
      if (iv === 3 || iv === 6 || iv === 12) setInterval(iv);
      if (loggedIn) void startCheckout(wanted, (iv === 3 || iv === 6 || iv === 12 ? iv : 1) as 1 | 3 | 6 | 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, searchParams]);

  const startCheckout = async (id: "starter" | "pro" | "business", iv: 1 | 3 | 6 | 12) => {
    if (!loggedIn) {
      window.location.href = loginRedirect(`/packages?checkout=${id}&interval=${iv}`);
      return;
    }
    setBusy(id);
    setCheckoutError(null);
    try {
      const res = await fetch(`${API_BASE}/dashboard/billing/subscriptions/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: id, interval: iv, method: "order" }),
      });
      const json = (await res.json()) as { checkoutPath?: string; error?: string };
      if (!res.ok || !json.checkoutPath) {
        throw new Error(json.error ?? t("checkout_error"));
      }
      window.location.href = json.checkoutPath;
    } catch (e) {
      setBusy(null);
      setCheckoutError(e instanceof Error ? e.message : t("checkout_error"));
    }
  };

  const discountPct = Math.round((catalog.discounts[String(interval)] ?? 0) * 100);

  const cards = useMemo(() => catalog.plans, [catalog.plans]);

  return (
    <div>
      {cancelled ? (
        <p className="text-muted-foreground mb-6 text-center text-sm">{t("checkout_cancelled")}</p>
      ) : null}
      {checkoutError ? (
        <p className="text-destructive mb-6 text-center text-sm">{checkoutError}</p>
      ) : null}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {([1, 3, 6, 12] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setInterval(n)}
            className={`rounded-full border px-3 py-1 text-sm ${
              interval === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {n === 1 ? t("interval_1") : t("interval_n", { n })}
            {n > 1 && catalog.discounts[String(n)] ? ` · ${Math.round(catalog.discounts[String(n)] * 100)}%` : ""}
          </button>
        ))}
      </div>

      <div className={`mx-auto grid max-w-6xl gap-6 ${compact ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2 lg:grid-cols-4"}`}>
        {cards.map((plan) => {
          const price = plan.prices[String(interval)];
          const current = planId != null && plan.planId === planId;
          const lower = planId != null && PLAN_RANK[plan.planId] > PLAN_RANK[planId];
          const features = [
            t("features.included_credits", { count: plan.includedCredits.toLocaleString() }),
            t("features.runs_per_day", { count: String(plan.workflowRunsPerDay) }),
            plan.canBuyCredits ? t("features.buy_credits") : t("features.no_buy_credits"),
            plan.canShareWorkflows ? t("features.sharing") : t("features.no_sharing"),
            plan.canUseWebhooks ? t("features.webhooks") : t("features.no_webhooks"),
            plan.maxCronJobs > 0 ? t("features.cron_count", { count: String(plan.maxCronJobs) }) : t("features.no_cron"),
            plan.canGraceWhenExhausted ? t("features.grace") : t("features.no_grace"),
          ];
          const cta = (() => {
            if (plan.planId === "free") return loggedIn ? t("go_dashboard") : t("start_free");
            if (current) return t("current_plan");
            if (planId == null || lower) return t("upgrade");
            return t("downgrade_end");
          })();
          const paidId = plan.planId === "free" ? null : plan.planId;
          const onPaid = () => {
            if (!paidId) {
              window.location.href = loggedIn ? "/dashboard/control/overview" : loginRedirect("/dashboard/control/overview");
              return;
            }
            if (current) return;
            void startCheckout(paidId, interval);
          };
          return (
            <div
              key={plan.planId}
              className={`card-hover relative rounded-2xl border p-6 transition-all duration-300 ${
                plan.popular ? "border-primary bg-card z-10 shadow-xl" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              {plan.popular ? (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="from-primary to-accent bg-gradient-to-r px-4 py-1 text-white shadow-lg">
                    <Sparkles className="mr-1 h-3 w-3" />
                    {t("most_popular")}
                  </Badge>
                </div>
              ) : null}
              <div className="mb-6 text-center">
                <h2 className="mb-2 text-xl font-semibold">{t(plan.planId)}</h2>
                <p className="text-muted-foreground mb-4 text-sm">{t(`${plan.planId}_desc`)}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{formatUsd(price?.usdPerMonth ?? plan.listPriceUsdPerMonth)}</span>
                  <span className="text-muted-foreground">{t("per_month")}</span>
                </div>
                {price && interval > 1 ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("pay_now", { amount: formatUsd(price.chargeUsd) })}
                    {discountPct > 0 ? ` · ${t("save_pct", { pct: String(discountPct) })}` : ""}
                  </p>
                ) : null}
              </div>
              <ul className="mb-8 space-y-3">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="text-accent mt-0.5 h-5 w-5 shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.popular ? "gradient" : "outline"}
                className="w-full"
                disabled={current || busy === plan.planId}
                onClick={onPaid}
              >
                {busy === plan.planId ? t("redirecting") : cta}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-6 text-center text-sm">{t("paypal_hint")}</p>
      {!compact ? (
        <p className="mt-4 text-center text-sm">
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
            {t("enterprise_footer")}
          </Link>
        </p>
      ) : (
        <div className="mt-10 text-center">
          <Button variant="ghost" asChild>
            <Link to="/packages">{t("compare_plans")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
