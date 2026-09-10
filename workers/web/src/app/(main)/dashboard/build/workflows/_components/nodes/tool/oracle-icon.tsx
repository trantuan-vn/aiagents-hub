"use client";

import { cn } from "@/lib/utils";

/** Oracle "O" mark — used on Get RAG / Save RAG / Get DB Info nodes. */
export function OracleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Oracle"
      role="img"
      focusable="false"
      className={cn("shrink-0 fill-[#F80000]", className)}
    >
      <title>Oracle</title>
      <path d="M16.412 4.412h-8.82a7.588 7.588 0 0 0-.008 15.176h8.828a7.588 7.588 0 0 0 0-15.176zm-.193 12.502H7.786a4.915 4.915 0 0 1 0-9.828h8.433a4.914 4.914 0 1 1 0 9.828z" />
    </svg>
  );
}
