"use client";

import { useEffect, useState } from "react";

import { matchesServiceStatusFilter } from "../../../service/_components/service-filter";
import type { Service } from "../../../service/_components/schema";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

/** Active, approved services — same criteria as Service Management "active" filter. */
export function useApprovedServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard/admin/service/list`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(await res.text());
        const data: Service[] = await res.json();
        const active = data.filter((s) => matchesServiceStatusFilter(s, "active"));
        if (!cancelled) setServices(active);
      } catch {
        if (!cancelled) setServices([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { services, loading };
}
