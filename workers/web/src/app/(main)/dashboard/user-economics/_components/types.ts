export type DualAmount = {
  usd: number;
  credits: number;
};

export type UserEconomicsProfile = {
  userId: string;
  identifier: string;
  planId?: string;
  membershipTier?: string;
  referrerId?: string;
  wallet: DualAmount;
};

export type UserEconomicsClassRow = {
  modelClass: string;
  runs: number;
  userCharged: DualAmount;
  hubRevenue: DualAmount;
  cogsAi: DualAmount;
  contribution: DualAmount;
  contributionPct: number;
};

export type UserEconomicsSeriesPoint = {
  period: string;
  hubRevenueUsd: number;
  cogsAiUsd: number;
  contributionUsd: number;
  creditsCharged: number;
};

export type UserEconomicsTopUser = {
  userId: string;
  identifier: string;
  runs: number;
  userCharged: DualAmount;
  hubRevenue: DualAmount;
  contribution: DualAmount;
  contributionPct: number;
};

export type UserEconomicsReport = {
  scope: "all" | "user";
  email: string | null;
  hours: number;
  creditPriceUsd: number;
  fromMs: number;
  toMs: number;
  groupBy: "day" | "month";
  profile: UserEconomicsProfile | null;
  runs: number;
  orders: number;
  userCharged: DualAmount;
  hubRevenue: DualAmount;
  cogsAi: DualAmount;
  cogsInfra: DualAmount;
  paymentFee: DualAmount;
  contribution: DualAmount;
  contributionPct: number;
  royaltyPaid: DualAmount;
  royaltyEarned: DualAmount;
  commissionEarned: DualAmount;
  commissionPaid: DualAmount;
  topUp: DualAmount;
  hubNet: DualAmount;
  byClass: UserEconomicsClassRow[];
  series: UserEconomicsSeriesPoint[];
  topUsers: UserEconomicsTopUser[];
};
