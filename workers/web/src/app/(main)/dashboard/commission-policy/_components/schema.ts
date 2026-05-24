import { z } from "zod";

import type { MembershipTier } from "../../voucher/_components/schema";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

const membershipTierEnum = z.enum(["member", "silver", "gold", "diamond"]);

export const commissionPolicyFormSchema = z
  .object({
    name: z.string().min(1),
    code: z.string().min(3).max(50),
    commissionPercent: z.number().min(0).max(100),
    applicableTo: z.enum(["ALL", "USER_GROUP"]),
    membershipTiers: z.array(membershipTierEnum).optional(),
    effectiveFrom: z.string(),
    effectiveTo: z.string(),
    priority: z.number().min(0),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .refine((data) => data.applicableTo !== "USER_GROUP" || (data.membershipTiers?.length ?? 0) > 0, {
    message: "Select at least one membership tier",
    path: ["membershipTiers"],
  });

export type CommissionPolicyFormValues = z.infer<typeof commissionPolicyFormSchema>;

export const ALL_MEMBERSHIP_TIERS: MembershipTier[] = ["member", "silver", "gold", "diamond"];

export interface CommissionPolicy {
  id: number;
  name: string;
  code: string;
  commissionPercent: number;
  applicableTo: string;
  membershipTiers?: MembershipTier[];
  effectiveFrom: string;
  effectiveTo: string;
  priority: number;
  status: string;
}
