"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface DidStatus {
  enabled: boolean;
  did?: string;
  linkedAt?: string;
}

export function DidCard() {
  const t = useTranslations("AccountPage.did");
  const [status, setStatus] = useState<DidStatus | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/did/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: Partial<DidStatus> = await res.json();
        setStatus({ enabled: data.enabled ?? false, did: data.did, linkedAt: data.linkedAt });
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-sm">{t("detail")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {status?.enabled ? (
            <Badge variant="default" className="bg-emerald-600 text-xs">
              {t("enabled")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              {t("optional")}
            </Badge>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/control/account/did">{t("manage")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
