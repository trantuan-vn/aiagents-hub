import type { MembershipTier } from "../../voucher/_components/schema";
import { getMembershipTierLabel } from "../../voucher/_components/voucher-display-utils";

import type { CommissionPolicy } from "./schema";

function rawField(raw: Record<string, unknown>, camel: string, snake?: string): unknown {
  if (snake) return raw[camel] ?? raw[snake];
  return raw[camel];
}

export function normalizePolicy(raw: Record<string, unknown>): CommissionPolicy {
  const tiers = rawField(raw, "membershipTiers", "membership_tiers");
  return {
    id: Number(raw.id),
    name: String(rawField(raw, "name") ?? ""),
    code: String(rawField(raw, "code") ?? ""),
    commissionPercent: Number(rawField(raw, "commissionPercent", "commission_percent") ?? 0),
    applicableTo: String(rawField(raw, "applicableTo", "applicable_to") ?? "ALL"),
    membershipTiers: Array.isArray(tiers) ? (tiers as MembershipTier[]) : undefined,
    effectiveFrom: String(rawField(raw, "effectiveFrom", "effective_from") ?? ""),
    effectiveTo: String(rawField(raw, "effectiveTo", "effective_to") ?? ""),
    priority: Number(rawField(raw, "priority") ?? 0),
    status: String(rawField(raw, "status") ?? ""),
  };
}

export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatApplicableTo(policy: CommissionPolicy, t: (key: string) => string): string {
  if (policy.applicableTo === "USER_GROUP" && policy.membershipTiers?.length) {
    return policy.membershipTiers.map((tier) => getMembershipTierLabel(tier)).join(", ");
  }
  if (policy.applicableTo === "USER_GROUP") return t("user_group");
  if (policy.applicableTo === "ALL") return t("all_users");
  return policy.applicableTo;
}
