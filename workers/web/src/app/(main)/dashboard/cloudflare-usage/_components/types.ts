export type WorkersPlanId = "workers_free" | "workers_paid" | "workers_enterprise";
export type MetricFamily = "compute" | "storage" | "data" | "ai" | "observability" | "zone" | "other";
export type MetricStatus = "under" | "watch" | "projected_over" | "over" | "hard_stop_today" | "unavailable";
export type CostSource = "invoice" | "catalog_estimate";

export type ZonePlan = {
  zoneName: string;
  zoneId: string;
  planId: string;
  publicName: string;
  subscriptionUsdPerMonth: number;
};

export type CloudflarePlans = {
  workers: {
    planId: WorkersPlanId;
    publicName: string;
    subscriptionUsdPerMonth: number;
    periodStart: string;
    periodEnd: string;
    state: string;
    periodAssumedUtc: boolean;
  };
  zones: ZonePlan[];
  addOns: Array<{ ratePlanId: string; publicName: string; usdPerMonth: number }>;
};

export type UsageMetricRow = {
  metricId: string;
  family: MetricFamily;
  label: string;
  planId: WorkersPlanId;
  included: number;
  includedPeriod: "month" | "day";
  unit: string;
  usageMtd: number;
  usageToday?: number;
  pctOfIncluded: number | null;
  projectedEom: number;
  exhaustAt: string | null;
  overageNow: number;
  overageProjected: number;
  overageUsdNow: number;
  overageUsdProjected: number;
  rounded: boolean;
  hardStopWhenExceeded: boolean;
  status: MetricStatus;
  confidence: "low" | "medium" | "high";
  burstPattern: boolean;
  costSource: CostSource;
  unavailableReason?: string;
  breakdown?: Array<{ key: string; label: string; usage: number; unit: string }>;
};

export type InventoryItem = {
  kind: string;
  id: string;
  name: string;
  expected: boolean;
  found: boolean;
  status: "ok" | "orphan" | "missing";
  notes: string[];
};

export type Recommendation = {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  metricId?: string;
  because: string;
  actions: string[];
  usdSavedPerMonth: { min: number; max: number };
  effort: "S" | "M" | "L";
  status: "advisory";
  priorityScore: number;
};

export type ExhaustMarker = {
  metricId: string;
  label: string;
  at: string;
  status: MetricStatus;
};

export type OverviewDto = {
  plans: CloudflarePlans;
  metrics: UsageMetricRow[];
  inventory: InventoryItem[];
  recommendations: Recommendation[];
  summary: {
    includedRemainingCount: number;
    trackedMetricCount: number;
    overageUsdNow: number;
    projectedEomUsd: number;
    flatUsd: number;
    variableUsdNow: number;
    variableUsdProjected: number;
    totalUsdNow: number;
    totalUsdProjected: number;
    nextExhaust: ExhaustMarker | null;
    noExhaustThisPeriod: boolean;
  };
  catalogVersion: string;
  asOf: string;
  costSource: CostSource;
  accountIdMasked: string;
  cachedAt: string;
  stale: boolean;
  alerts?: Array<{
    metricId: string;
    label: string;
    exhaustAt: string;
    daysAhead: number;
    overageUsdProjected: number;
  }>;
};

export type UsageApiError = {
  error?: string;
  code?: "plans_unreadable" | "token_missing" | "rate_limited" | "catalog_confirm_required" | "apply_confirm_required" | "apply_forbidden" | "rollback_unavailable";
};
