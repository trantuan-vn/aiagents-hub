import type { Service } from "./schema";

export type ServiceStatusFilter = "all" | "active" | "pending" | "inactive";

export function matchesServiceStatusFilter(service: Service, status: ServiceStatusFilter): boolean {
  if (status === "all") return true;
  const approval = service.approvalStatus ?? "approved";
  const isPending = approval === "pending";
  const isExpired = Boolean(service.expiresAt && new Date(service.expiresAt) < new Date());
  const isActiveApproved = service.isActive && !isPending && !isExpired;

  if (status === "pending") return isPending;
  if (status === "active") return isActiveApproved;
  return !isPending && !isActiveApproved;
}

export function serviceSearchHaystack(service: Service): string {
  return [service.name, service.endpoint, service.model, service.id != null ? String(service.id) : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterServices(
  services: Service[],
  query: string,
  status: ServiceStatusFilter,
): Service[] {
  const q = query.trim().toLowerCase();
  return services.filter((s) => {
    if (!matchesServiceStatusFilter(s, status)) return false;
    if (!q) return true;
    return serviceSearchHaystack(s).includes(q);
  });
}

export function countServicesByStatus(services: Service[]): Record<ServiceStatusFilter, number> {
  return {
    all: services.length,
    active: services.filter((s) => matchesServiceStatusFilter(s, "active")).length,
    pending: services.filter((s) => matchesServiceStatusFilter(s, "pending")).length,
    inactive: services.filter((s) => matchesServiceStatusFilter(s, "inactive")).length,
  };
}
