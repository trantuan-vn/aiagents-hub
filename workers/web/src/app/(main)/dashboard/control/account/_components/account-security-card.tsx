"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { KeyRound, MessageSquare, ShieldCheck, Key, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface AuthenticatorStatus {
  enabled: boolean;
  enabledAt?: string;
}

interface SmsStatus {
  enabled: boolean;
  enabledAt?: string;
}

interface PasskeyStatus {
  enabled: boolean;
  credentialCount: number;
}

interface BackupCodesStatus {
  enabled: boolean;
  remainingCount: number;
}

export function AccountSecurityCard() {
  const t = useTranslations("AccountPage.security");
  const [authenticatorStatus, setAuthenticatorStatus] = useState<AuthenticatorStatus | null>(null);
  const [smsStatus, setSmsStatus] = useState<SmsStatus | null>(null);
  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyStatus | null>(null);
  const [backupCodesStatus, setBackupCodesStatus] = useState<BackupCodesStatus | null>(null);

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

  const fetchPasskeyStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/passkey/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { enabled?: boolean; credentialCount?: number } = await res.json();
        setPasskeyStatus({
          enabled: Boolean(data.enabled && (data.credentialCount ?? 0) > 0),
          credentialCount: data.credentialCount ?? 0,
        });
      }
    } catch {
      setPasskeyStatus(null);
    }
  }, []);

  const fetchBackupCodesStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/backup-codes/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { enabled?: boolean; remainingCount?: number } = await res.json();
        setBackupCodesStatus({
          enabled: Boolean(data.enabled && (data.remainingCount ?? 0) > 0),
          remainingCount: data.remainingCount ?? 0,
        });
      }
    } catch {
      setBackupCodesStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchAuthenticatorStatus();
    void fetchSmsStatus();
    void fetchPasskeyStatus();
    void fetchBackupCodesStatus();
  }, [fetchAuthenticatorStatus, fetchSmsStatus, fetchPasskeyStatus, fetchBackupCodesStatus]);

  const methods = [
    {
      key: "passkey",
      icon: ShieldCheck,
      titleKey: "passkey_title",
      descKey: "passkey_desc",
      actionKey: "add",
      href: "/dashboard/control/account/passkey",
      showStatus: true,
      enabled: passkeyStatus?.enabled ?? false,
    },
    {
      key: "authenticator",
      icon: KeyRound,
      titleKey: "authenticator_title",
      descKey: "authenticator_desc",
      actionKey: "setup",
      href: "/dashboard/control/account/authenticator",
      showStatus: true,
      enabled: authenticatorStatus?.enabled ?? false,
    },
    {
      key: "sms",
      icon: MessageSquare,
      titleKey: "sms_title",
      descKey: "sms_desc",
      actionKey: "enable",
      href: "/dashboard/control/account/sms",
      showStatus: true,
      enabled: smsStatus?.enabled ?? false,
    },
    {
      key: "backup_codes",
      icon: Key,
      titleKey: "backup_codes_title",
      descKey: "backup_codes_desc",
      actionKey: "generate",
      href: "/dashboard/control/account/backup-codes",
      showStatus: true,
      enabled: backupCodesStatus?.enabled ?? false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.map((m, i) => (
          <SecurityMethodRow
            key={m.key}
            method={m}
            showSeparator={i > 0}
            backupCodesRemaining={m.key === "backup_codes" ? backupCodesStatus?.remainingCount : undefined}
            t={t}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface MethodItem {
  key: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  actionKey: string;
  href: string;
  showStatus: boolean;
  enabled: boolean;
}

function SecurityMethodRow({
  method: m,
  showSeparator,
  backupCodesRemaining,
  t,
}: {
  method: MethodItem;
  showSeparator: boolean;
  backupCodesRemaining: number | undefined;
  t: (key: string, values?: { count?: number }) => string;
}) {
  const Icon = m.icon;
  const actionLabel = m.showStatus && m.enabled ? t("manage") : t(m.actionKey);
  const button = (
    <Button variant="outline" size="sm" className="shrink-0" asChild>
      <Link href={m.href}>{actionLabel}</Link>
    </Button>
  );
  const showRemaining =
    m.key === "backup_codes" && m.enabled && backupCodesRemaining != null && backupCodesRemaining >= 0;
  return (
    <div>
      {showSeparator && <Separator className="my-4" />}
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
            <p className="text-muted-foreground text-sm">
              {t(m.descKey)}
              {showRemaining && (
                <span className="ml-1 font-medium"> ({t("remaining_codes", { count: backupCodesRemaining })})</span>
              )}
            </p>
          </div>
        </div>
        {button}
      </div>
    </div>
  );
}
