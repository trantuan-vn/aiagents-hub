import { formatCredits, formatUsd } from "@/lib/utils";

import type { DualAmount } from "./types";

export function DualValue({ amount, size = "lg" }: { amount: DualAmount; size?: "lg" | "sm" }) {
  if (size === "sm") {
    return (
      <div className="text-right tabular-nums">
        <div className="font-medium">{formatUsd(amount.usd)}</div>
        <div className="text-muted-foreground text-xs">{formatCredits(amount.credits)}</div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-2xl font-bold tabular-nums">{formatUsd(amount.usd)}</p>
      <p className="text-muted-foreground mt-1 text-sm tabular-nums">{formatCredits(amount.credits)}</p>
    </div>
  );
}
