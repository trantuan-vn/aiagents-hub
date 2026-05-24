import { MEMBERSHIP_TIER_LABELS, type MembershipTier, type Voucher } from "./schema";

export function getMembershipTierLabel(tier: MembershipTier): string {
  switch (tier) {
    case "member":
      return MEMBERSHIP_TIER_LABELS.member;
    case "silver":
      return MEMBERSHIP_TIER_LABELS.silver;
    case "gold":
      return MEMBERSHIP_TIER_LABELS.gold;
    case "diamond":
      return MEMBERSHIP_TIER_LABELS.diamond;
  }
}

export function getVoucherDiscountPercent(voucher: Voucher): number {
  const legacy = voucher as Voucher & { discountValue?: number };
  return voucher.discountPercent ?? legacy.discountValue ?? 0;
}

export function getVoucherStatusBadge(voucher: Voucher): {
  variant: "default" | "secondary" | "destructive";
  labelKey: "status.active" | "status.inactive" | "status.expired";
} {
  if (voucher.status !== "ACTIVE") {
    return { variant: "secondary", labelKey: "status.inactive" };
  }
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
    return { variant: "destructive", labelKey: "status.expired" };
  }
  return { variant: "default", labelKey: "status.active" };
}

export function getVoucherTierLabel(
  voucher: Voucher,
  allUsersLabel: string,
): string {
  if (voucher.applicableTo === "GROUPS" && voucher.membershipTiers?.length) {
    return voucher.membershipTiers.join(", ");
  }
  return allUsersLabel;
}
