"use client";

import * as React from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";

import type { AppFeature } from "../_data/codebase-context";

interface FeatureTreeProps {
  features: AppFeature[];
  onSelect: (featureId: string) => void;
}

function groupByCategory(features: AppFeature[]): Record<string, AppFeature[]> {
  const acc: Record<string, AppFeature[]> = {};
  for (const f of features) {
    const cat = String(f.category || "other");
    if (!(cat in acc)) acc[cat] = [];
    acc[cat].push(f);
  }
  return acc;
}

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Thanh toán & Đơn hàng",
  token: "API Keys",
  overview: "Tổng quan",
  monitor: "Monitor & Logs",
  stats: "Thống kê",
  admin: "Quản trị",
  referral: "Giới thiệu",
  other: "Khác",
};

export function FeatureTree({ features, onSelect }: FeatureTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set(["billing", "token", "overview"]));
  const groups = groupByCategory(features);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h3 className="font-medium">Chức năng có sẵn</h3>
        <p className="text-muted-foreground text-xs">Chọn để điền nhanh</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {Object.entries(groups).map(([cat, items]) => {
            const isOpen = expanded.has(cat);
            return (
              <div key={cat} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggle(cat)}
                  className="hover:bg-muted flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm font-medium"
                >
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
                {isOpen && (
                  <div className="mt-0.5 ml-4 space-y-0.5 border-l pl-2">
                    {items.map((f) => (
                      <button
                        key={`${cat}-${f.id}`}
                        type="button"
                        onClick={() => onSelect(f.id)}
                        className="hover:bg-muted text-muted-foreground hover:text-foreground block w-full rounded px-2 py-1.5 text-left text-xs transition-colors"
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
