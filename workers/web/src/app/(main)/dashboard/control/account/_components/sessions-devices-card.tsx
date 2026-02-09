"use client";

import { useCallback, useEffect, useState } from "react";

import { Monitor, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export interface SessionItem {
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
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/account/sessions`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || t("fetch_error"));
      }
      const raw = await res.json();
      setSessions(normalizeSessionsResponse(raw));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("fetch_error");
      setError(msg);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const revokeSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/account/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: t("revoked"), description: t("revoked_description") });
      void fetchSessions();
    } catch (e) {
      toast({
        title: t("revoke_error"),
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  };

  const getDeviceIcon = (ua: string | undefined) => {
    if (!ua) return Monitor;
    const u = ua.toLowerCase();
    if (u.includes("mobile") || u.includes("android") || u.includes("iphone")) return Smartphone;
    return Monitor;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>{t("fetch_error")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("loading")}</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("no_sessions")}</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const Icon = getDeviceIcon(s.userAgent);
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="text-muted-foreground h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {s.userAgent ? s.userAgent.slice(0, 50) : t("unknown_device")}
                        </span>
                        {s.isCurrent && (
                          <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">
                            {t("current")}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {s.ipAddress ?? "—"} · {s.type}
                      </p>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revokeSession(s.hashSessionId)}
                    >
                      {t("revoke")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
