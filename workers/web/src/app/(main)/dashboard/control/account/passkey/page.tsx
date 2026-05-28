"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { startRegistration } from "@simplewebauthn/browser";
import { ArrowLeft, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRefreshDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

/** Options shape expected by startRegistration (from @simplewebauthn/browser) */
type RegistrationOptionsJSON = Parameters<typeof startRegistration>[0];

interface PasskeyCredentialItem {
  id: number;
  credentialId: string;
  deviceType?: string;
  createdAt?: string;
}

export default function PasskeyPage() {
  const t = useTranslations("AccountPage.passkey");
  const { toast } = useToast();
  const refreshUser = useRefreshDashboardUser();
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<PasskeyCredentialItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/passkey/credentials`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setCredentials(Array.isArray(data) ? data : []);
      } else {
        setCredentials([]);
      }
    } catch {
      setCredentials([]);
      toast({ title: t("error_fetch"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void fetchCredentials();
  }, [fetchCredentials]);

  const fetchRegistrationOptions = useCallback(async (): Promise<{
    options: RegistrationOptionsJSON;
    challengeKey: string;
  }> => {
    const optRes = await fetch(`${API_BASE_URL}/dashboard/auth/passkey/registration/options`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!optRes.ok) {
      const err = (await optRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? t("error_options"));
    }
    const body = await optRes.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("options" in body) ||
      !("challengeKey" in body) ||
      typeof body.challengeKey !== "string"
    ) {
      throw new Error(t("error_options"));
    }
    return { options: body.options as RegistrationOptionsJSON, challengeKey: body.challengeKey };
  }, [t]);

  const verifyRegistration = useCallback(
    async (credential: unknown, challengeKey: string) => {
      const verifyRes = await fetch(`${API_BASE_URL}/dashboard/auth/passkey/registration/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: credential, challengeKey }),
      });
      if (!verifyRes.ok) {
        const err = (await verifyRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("error_verify"));
      }
    },
    [t],
  );

  const handleAddPasskey = useCallback(async () => {
    if (adding) return;
    if (typeof window !== "undefined" && typeof window.PublicKeyCredential === "undefined") {
      toast({ title: t("not_supported"), variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { options, challengeKey } = await fetchRegistrationOptions();
      const credential = await startRegistration(options);
      await verifyRegistration(credential, challengeKey);
      toast({ title: t("add_success") });
      void refreshUser();
      void fetchCredentials();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error_verify");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }, [adding, t, toast, fetchRegistrationOptions, verifyRegistration, fetchCredentials, refreshUser]);

  const handleRemove = async (credentialId: string) => {
    if (removingId) return;
    setRemovingId(credentialId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/dashboard/auth/passkey/credentials/${encodeURIComponent(credentialId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error(t("error_remove"));
      toast({ title: t("removed") });
      void fetchCredentials();
    } catch {
      toast({ title: t("error_remove"), variant: "destructive" });
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link href="/dashboard/control/account">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("back_to_account")}
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </div>
    );
  }

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
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{t("your_passkeys")}</p>
            <Button onClick={handleAddPasskey} disabled={adding}>
              {adding ? t("loading") : t("add")}
            </Button>
          </div>

          {credentials.length === 0 ? (
            <p className="bg-muted/30 text-muted-foreground rounded-lg border p-4 text-sm">{t("no_passkeys")}</p>
          ) : (
            <ul className="space-y-2">
              {credentials.map((cred) => (
                <li
                  key={cred.credentialId}
                  className="bg-muted/30 flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <span className="text-muted-foreground font-mono text-sm">
                    {cred.deviceType === "singleDevice" ? "Device" : "Passkey"} • {cred.credentialId.slice(0, 16)}…
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removingId === cred.credentialId}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("remove")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("remove_confirm")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => void handleRemove(cred.credentialId)}
                        >
                          {t("remove")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
