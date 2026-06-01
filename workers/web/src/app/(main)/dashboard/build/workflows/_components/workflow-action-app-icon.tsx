"use client";

import { Globe } from "lucide-react";

import { SimpleIcon as BrandIcon } from "@/components/simple-icon";
import { cn } from "@/lib/utils";

import type { WorkflowActionAppCatalogItem } from "./workflow-action-app-catalog";

export function ActionAppIcon({
  item,
  className,
}: {
  item: WorkflowActionAppCatalogItem | null;
  className?: string;
}) {
  if (item?.brandIcon) {
    return <BrandIcon icon={item.brandIcon} className={cn("shrink-0", className)} />;
  }
  const Icon = item?.lucideIcon ?? Globe;
  return <Icon className={cn("text-muted-foreground shrink-0", className)} aria-hidden />;
}
