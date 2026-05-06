"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ArrowLeft, Key, Copy, RefreshCw, Check } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

interface BackupCodesStatus {
  enabled: boolean;
  remainingCount: number;
}

function BackupCodesLoading({ t }: { t: (k: string) => string }) {
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

function BackupCodesDisplay({
  codes,
  copied,
  onCopyAll,
  t,
}: {
  codes: string[];
  copied: boolean;
  onCopyAll: () => void;
  t: (k: string) => string;
}) {
  return (
    <>
      <p className="text-muted-foreground text-sm">{t("save_codes_warning")}</p>
      <div className="bg-muted/50 rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-muted-foreground text-sm">{t("your_codes")}</span>
          <Button variant="outline" size="sm" onClick={onCopyAll}>
            {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? t("copied") : t("copy_all")}
          </Button>
        </div>
        <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
          {codes.map((code) => (
            <li key={code} className="bg-background flex items-center rounded border px-3 py-2">
              <span className="select-all">{code}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted-foreground text-xs">{t("show_once_hint")}</p>
    </>
  );
}

function BackupCodesActions({
  status,
  generating,
  regenerating,
  showRegenerateConfirm,
  onGenerate,
  onRegenerate,
  onOpenRegenerateConfirm,
  onCloseRegenerateConfirm,
  t,
}: {
  status: BackupCodesStatus | null;
  generating: boolean;
  regenerating: boolean;
  showRegenerateConfirm: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  onOpenRegenerateConfirm: () => void;
  onCloseRegenerateConfirm: (open: boolean) => void;
  t: (k: string, values?: Record<string, string | number>) => string;
}) {
  const hasCodes = status?.enabled ?? false;
  return (
    <>
      {hasCodes ? (
        <p className="text-muted-foreground text-sm">{t("remaining_count", { count: status?.remainingCount ?? 0 })}</p>
      ) : (
        <p className="text-muted-foreground text-sm">{t("no_codes")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!hasCodes ? (
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? t("loading") : t("generate")}
          </Button>
        ) : (
          <AlertDialog open={showRegenerateConfirm} onOpenChange={onCloseRegenerateConfirm}>
            <Button variant="outline" onClick={onOpenRegenerateConfirm} disabled={regenerating}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {regenerating ? t("loading") : t("regenerate")}
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("regenerate_confirm_title")}</AlertDialogTitle>
                <AlertDialogDescription>{t("regenerate_confirm_desc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => void onRegenerate()}
                >
                  {t("regenerate")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {hasCodes && <p className="text-muted-foreground text-xs">{t("regenerate_hint")}</p>}
    </>
  );
}

export default function BackupCodesPage() {
  const t = useTranslations("AccountPage.backup_codes");
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BackupCodesStatus | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/backup-codes/status`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data: { enabled?: boolean; remainingCount?: number } = await res.json();
        setStatus({
          enabled: Boolean(data.enabled && (data.remainingCount ?? 0) > 0),
          remainingCount: data.remainingCount ?? 0,
        });
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
      toast({ title: t("error_fetch"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/backup-codes/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replaceExisting: false }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; codes?: string[] };
      if (!res.ok) {
        throw new Error(data.error ?? t("error_generate"));
      }
      if (Array.isArray(data.codes)) {
        setCodes(data.codes);
        toast({ title: t("generate_success") });
        void fetchStatus();
      } else {
        throw new Error(t("error_generate"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error_generate");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [generating, t, toast, fetchStatus]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating) return;
    setShowRegenerateConfirm(false);
    setRegenerating(true);
    setCodes(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/backup-codes/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replaceExisting: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; codes?: string[] };
      if (!res.ok) {
        throw new Error(data.error ?? t("error_regenerate"));
      }
      if (Array.isArray(data.codes)) {
        setCodes(data.codes);
        toast({ title: t("regenerate_success") });
        void fetchStatus();
      } else {
        throw new Error(t("error_regenerate"));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error_regenerate");
      toast({ title: msg, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  }, [regenerating, t, toast, fetchStatus]);

  const copyAllCodes = useCallback(() => {
    if (!codes?.length) return;
    const text = codes.join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: t("copied") });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [codes, t, toast]);

  if (loading) {
    return <BackupCodesLoading t={t} />;
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
            <Key className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {codes ? (
            <BackupCodesDisplay codes={codes} copied={copied} onCopyAll={copyAllCodes} t={t} />
          ) : (
            <BackupCodesActions
              status={status}
              generating={generating}
              regenerating={regenerating}
              showRegenerateConfirm={showRegenerateConfirm}
              onGenerate={handleGenerate}
              onRegenerate={handleRegenerate}
              onOpenRegenerateConfirm={() => setShowRegenerateConfirm(true)}
              onCloseRegenerateConfirm={setShowRegenerateConfirm}
              t={t}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
