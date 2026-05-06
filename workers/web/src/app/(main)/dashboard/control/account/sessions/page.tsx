"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ArrowLeft, Calendar, Copy, Globe, Monitor, Smartphone, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

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

const BROWSER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /edg\//, label: "Edge" },
  { pattern: /opr\//, label: "Opera" },
  { pattern: /chrome/, label: "Chrome" },
  { pattern: /firefox/, label: "Firefox" },
  { pattern: /safari/, label: "Safari" },
];

function getOSFromUA(u: string): string {
  if (u.includes("windows")) return "Windows";
  if (u.includes("mac")) return "macOS";
  if (u.includes("linux")) return "Linux";
  if (u.includes("android")) return "Android";
  if (u.includes("iphone") || u.includes("ipad")) return "iOS";
  return "";
}

function getDeviceSummary(ua: string | undefined): string {
  if (!ua) return "";
  const u = ua.toLowerCase();
  const browser = BROWSER_PATTERNS.find((b) => b.pattern.test(u))?.label ?? "Browser";
  const os = getOSFromUA(u);
  const device = u.includes("mobile") && !u.includes("ipad") ? "Mobile" : "Desktop";
  return [browser, os, device].filter(Boolean).join(" · ");
}

function formatExpiresAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
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

function SessionIdCopy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const t = useTranslations("AccountPage.sessions");

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast({ title: t("session_id_copied") });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const short = value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground font-mono text-xs">ID: {short}</span>
      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copy} title={value}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export default function SessionsPage() {
  const t = useTranslations("AccountPage.sessions");
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sessions`, {
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
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {
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
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link href="/dashboard/control/account">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("back_to_account")}
        </Link>
      </Button>

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
            <ul className="space-y-4">
              {sessions.map((s) => {
                const Icon = getDeviceIcon(s.userAgent);
                const summary = getDeviceSummary(s.userAgent) || t("unknown_device");
                return (
                  <li key={s.id} className="bg-card/50 hover:bg-muted/30 rounded-xl border transition-colors">
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <div className="bg-muted/80 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
                          <Icon className="text-muted-foreground h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-foreground font-medium">{summary}</span>
                            {s.isCurrent && (
                              <Badge variant="secondary" className="shrink-0 font-medium">
                                {t("current")}
                              </Badge>
                            )}
                            <Badge variant="outline" className="shrink-0 text-xs font-normal">
                              {s.type}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            {s.ipAddress && (
                              <span className="flex items-center gap-1">
                                <Globe className="h-3.5 w-3.5 shrink-0" />
                                {s.ipAddress}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              {formatExpiresAt(s.expiresAt)}
                            </span>
                          </div>
                          {s.userAgent && (
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-foreground h-auto px-0 py-1 text-xs"
                                >
                                  User-Agent (full)
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="bg-muted/50 mt-2 rounded-lg px-3 py-2">
                                  <p className="text-muted-foreground font-mono text-xs break-all">{s.userAgent}</p>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                          {s.hashSessionId && <SessionIdCopy value={s.hashSessionId} />}
                        </div>
                      </div>
                      {!s.isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                          onClick={() => revokeSession(s.hashSessionId)}
                        >
                          {t("revoke")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
