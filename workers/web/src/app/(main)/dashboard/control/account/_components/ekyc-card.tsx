"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

type EkycStatusType =
  | "not_started"
  | "document_submitted"
  | "document_verified"
  | "face_submitted"
  | "face_verified"
  | "verified";

export function EkycCard() {
  const t = useTranslations("AccountPage.ekyc");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<EkycStatusType | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/ekyc/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { status?: EkycStatusType } = await res.json();
        setStatus(data.status ?? "not_started");
      } else {
        setStatus("not_started");
      }
    } catch {
      setStatus("not_started");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const isVerified = status === "verified" || status === "face_verified";
  const inProgress = status === "document_submitted" || status === "document_verified" || status === "face_submitted";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">{t("detail")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          ) : (
            <>
              {isVerified && (
                <Badge variant="default" className="bg-emerald-600">
                  {t("badge_verified")}
                </Badge>
              )}
              {inProgress && <Badge variant="secondary">{t("badge_in_progress")}</Badge>}
              {!isVerified && !inProgress && <Badge variant="outline">{t("badge_not_started")}</Badge>}
            </>
          )}
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link href="/dashboard/control/account/ekyc">{t("manage")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
