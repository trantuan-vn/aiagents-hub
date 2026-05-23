"use client";

import { Badge } from "@/components/ui/badge";

import type { WorkflowClosedPeriodRow } from "../../_lib/api";

interface PayoutStatusBadgeProps {
  status: WorkflowClosedPeriodRow["payoutStatus"];
  labels: { pending: string; paid: string; not_scheduled: string };
}

export function PayoutStatusBadge({ status, labels }: PayoutStatusBadgeProps) {
  if (status === "paid") {
    return <Badge>{labels.paid}</Badge>;
  }
  if (status === "pending") {
    return <Badge variant="secondary">{labels.pending}</Badge>;
  }
  return <Badge variant="outline">{labels.not_scheduled}</Badge>;
}
