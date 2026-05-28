"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import {
  fetchCaptchaConfig,
  isValidTurnstileSiteKey,
  TurnstileField,
} from "@/components/auth/turnstile-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";
const ENV_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function StrongAuthReverify() {
  const { toast } = useToast();
  const router = useRouter();
  const user = useDashboardUser();

  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void fetchCaptchaConfig(AUTH_API_URL).then(({ enabled, siteKey }) => {
      if (cancelled) return;
      const fallback = isValidTurnstileSiteKey(ENV_TURNSTILE_SITE_KEY) ? ENV_TURNSTILE_SITE_KEY : null;
      setCaptchaEnabled(enabled);
      setTurnstileSiteKey(siteKey ?? fallback);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendOtp = useCallback(async () => {
    if (!user?.identifier) return;
    if (sending) return;
    if (captchaRequired && !turnstileToken) {
      toast({
        title: "Captcha required",
        description: "Please complete captcha to continue.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    setOtpSent(false);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/otp/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: user.identifier,
          language: "en",
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        requiresCaptcha?: boolean;
        siteKey?: string | null;
        error?: string;
      };

      if (!res.ok) {
        if (data.requiresCaptcha) {
          setCaptchaRequired(true);
          setTurnstileToken("");
          const captchaSiteKey = data.siteKey;
          if (typeof captchaSiteKey === "string" && isValidTurnstileSiteKey(captchaSiteKey)) {
            setTurnstileSiteKey(captchaSiteKey);
          }
          toast({
            title: "Captcha required",
            description: data.error ?? "Please complete captcha to continue.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(data.error ?? "Failed to send OTP");
      }

      toast({ title: "Verification code sent" });
      setOtpSent(true);
      setCode("");
      setCaptchaRequired(false);
    } catch (e) {
      toast({
        title: "Failed to send code",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [sending, toast, user?.identifier, captchaRequired, turnstileToken]);

  const verify = useCallback(async () => {
    if (!user?.identifier) return;
    if (verifying) return;
    if (code.length !== 6) return;

    setVerifying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/auth/otp/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: user.identifier, otp: code }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "OTP verification failed");
      }

      toast({ title: "Verified. You can enable 2FA now." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Verification failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  }, [code, toast, user?.identifier, verifying, router]);

  if (!user?.requiresStrongAuthSetup) return null;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Send a verification code to unlock security setup.
      </div>
      {(captchaRequired || captchaEnabled) && turnstileSiteKey ? (
        <TurnstileField
          siteKey={turnstileSiteKey}
          onToken={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileToken("")}
        />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={() => void sendOtp()} disabled={sending} className="sm:w-52">
          {sending ? "Sending..." : "Send code"}
        </Button>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="Enter 6-digit code"
          className="font-mono sm:flex-1"
          disabled={verifying}
        />
        <Button onClick={() => void verify()} disabled={!otpSent || verifying || code.length !== 6}>
          {verifying ? "Verifying..." : "Verify"}
        </Button>
      </div>
      {!otpSent ? (
        <div className="text-xs text-muted-foreground">
          Send code first, then enter the 6-digit OTP.
        </div>
      ) : null}
    </div>
  );
}

