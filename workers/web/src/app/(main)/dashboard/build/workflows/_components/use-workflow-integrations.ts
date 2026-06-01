"use client";

import { useEffect, useState } from "react";

import { listWorkflowIntegrations, type IntegrationPreset } from "../_lib/api";

export function useWorkflowIntegrations() {
  const [integrations, setIntegrations] = useState<IntegrationPreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { integrations: list } = await listWorkflowIntegrations();
        if (!cancelled) setIntegrations(list);
      } catch {
        if (!cancelled) setIntegrations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { integrations, loading };
}
