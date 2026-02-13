"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Loader2, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface SessionItem {
  id: number;
  hashSessionId: string;
  type: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  isActive: boolean;
  isCurrent?: boolean;
}

function isSessionItem(value: unknown): value is SessionItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "hashSessionId" in value &&
    typeof (value as Record<string, unknown>).hashSessionId === "string"
  );
}

function normalizeSessionsResponse(raw: unknown): SessionItem[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is SessionItem => isSessionItem(item));
  }
  if (raw !== null && typeof raw === "object" && "sessions" in raw) {
    const s = (raw as Record<string, unknown>).sessions;
    return Array.isArray(s) ? s.filter((item): item is SessionItem => isSessionItem(item)) : [];
  }
  return [];
}

export function SessionsDevicesCard() {
  const t = useTranslations("AccountPage.sessions");
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sessions`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const raw = await res.json();
        const sessions = normalizeSessionsResponse(raw);
        setSessionCount(sessions.length);
      } else {
        setSessionCount(0);
      }
    } catch {
      setSessionCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          ) : (
            <span className="text-muted-foreground text-sm">
              {sessionCount !== null ? t("sessions_count", { count: sessionCount }) : t("loading")}
            </span>
          )}
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link href="/dashboard/control/account/sessions">{t("manage")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
