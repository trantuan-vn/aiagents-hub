"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { KeyRound, MessageSquare, ShieldCheck, Key } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

interface AuthenticatorStatus {
  enabled: boolean;
  enabledAt?: string;
}

interface SmsStatus {
  enabled: boolean;
  enabledAt?: string;
}

export function AccountSecurityCard() {
  const t = useTranslations("AccountPage.security");
  const [authenticatorStatus, setAuthenticatorStatus] = useState<AuthenticatorStatus | null>(null);
  const [smsStatus, setSmsStatus] = useState<SmsStatus | null>(null);

  const fetchAuthenticatorStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/authenticator/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { enabled?: boolean; enabledAt?: string } = await res.json();
        setAuthenticatorStatus({ enabled: Boolean(data.enabled), enabledAt: data.enabledAt });
      }
    } catch {
      setAuthenticatorStatus(null);
    }
  }, []);

  const fetchSmsStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/sms/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { enabled?: boolean; enabledAt?: string } = await res.json();
        setSmsStatus({ enabled: Boolean(data.enabled), enabledAt: data.enabledAt });
      }
    } catch {
      setSmsStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchAuthenticatorStatus();
    void fetchSmsStatus();
  }, [fetchAuthenticatorStatus, fetchSmsStatus]);

  const methods = [
    {
      key: "authenticator",
      icon: KeyRound,
      titleKey: "authenticator_title",
      descKey: "authenticator_desc",
      status: "optional",
      actionKey: "setup",
      manageKey: "manage",
      href: "/dashboard/control/account/authenticator",
      showStatus: true,
      enabled: authenticatorStatus?.enabled ?? false,
    },
    {
      key: "sms",
      icon: MessageSquare,
      titleKey: "sms_title",
      descKey: "sms_desc",
      status: "optional",
      actionKey: "enable",
      manageKey: "manage",
      href: "/dashboard/control/account/sms",
      showStatus: true,
      enabled: smsStatus?.enabled ?? false,
    },
    {
      key: "passkey",
      icon: ShieldCheck,
      titleKey: "passkey_title",
      descKey: "passkey_desc",
      status: "optional",
      actionKey: "add",
      href: null,
      showStatus: false,
      enabled: false,
    },
    {
      key: "backup_codes",
      icon: Key,
      titleKey: "backup_codes_title",
      descKey: "backup_codes_desc",
      status: "optional",
      actionKey: "generate",
      href: null,
      showStatus: false,
      enabled: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.map((m, i) => {
          const Icon = m.icon;
          const actionLabel = m.showStatus && m.enabled ? t("manage") : t(m.actionKey);
          const button = m.href ? (
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href={m.href}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="shrink-0" disabled>
              {actionLabel}
            </Button>
          );
          return (
            <div key={m.key}>
              {i > 0 && <Separator className="my-4" />}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="text-muted-foreground h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t(m.titleKey)}</span>
                      {m.showStatus && m.enabled ? (
                        <Badge variant="default" className="bg-emerald-600 text-xs">
                          {t("enabled")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {t("optional")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">{t(m.descKey)}</p>
                  </div>
                </div>
                {button}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
