"use client";

import { useEffect, useState } from "react";

import { matchesServiceStatusFilter } from "../../../../service/_components/service-filter";
import type { Service } from "../../../../service/_components/schema";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

let approvedServicesCache: Service[] | null = null;
let approvedServicesPromise: Promise<Service[]> | null = null;

export async function prefetchApprovedServices(): Promise<void> {
  try {
    await fetchApprovedServices();
  } catch {
    // drawer shows empty list on failure
  }
}

async function fetchApprovedServices(): Promise<Service[]> {
  if (approvedServicesCache) return approvedServicesCache;
  if (approvedServicesPromise) return approvedServicesPromise;

  approvedServicesPromise = (async () => {
    const res = await fetch(`${API_BASE_URL}/dashboard/admin/service/list/approved`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(await res.text());
    const data: Service[] = await res.json();
    const active = data.filter((s) => matchesServiceStatusFilter(s, "active"));
    approvedServicesCache = active;
    return active;
  })();

  try {
    return await approvedServicesPromise;
  } catch (err) {
    approvedServicesPromise = null;
    throw err;
  }
}

/** Active, approved services — same criteria as Service Management "active" filter. */
export function useApprovedServices() {
  const [services, setServices] = useState<Service[]>(approvedServicesCache ?? []);
  const [loading, setLoading] = useState(approvedServicesCache === null);

  useEffect(() => {
    if (approvedServicesCache) {
      setServices(approvedServicesCache);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void fetchApprovedServices()
      .then((active) => {
        if (!cancelled) setServices(active);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { services, loading };
}
