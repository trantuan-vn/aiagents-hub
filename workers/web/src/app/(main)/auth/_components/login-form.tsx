"use client";

/* eslint-disable complexity, max-lines, space-before-function-paren, react-hooks/exhaustive-deps, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-assertion -- Login form has multiple auth flows */

import { useState, useCallback, useEffect, useRef } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { HumanChallengeTurnstile, useHumanChallenge } from "@/hooks/use-human-challenge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatAuthApiErrorMessage } from "@/lib/auth-api-error";
import { buildAuthClientHeaders } from "@/lib/auth-client-headers";

type AuthOptionsJSON = Parameters<typeof startAuthentication>[0];

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";
const ENV_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function authJsonHeaders(): Record<string, string> {
  return { ...buildAuthClientHeaders(), "Content-Type": "application/json" };
}

function debounce<T extends (...args: never[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function OtpDialog({
  open,
  onOpenChange,
  identifier,
  onVerify,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identifier: string;
  onVerify: (code: string) => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
  const [otp, setOtp] = useState("");
  useEffect(() => {
    if (open) setOtp("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="otp-dialog-description">
        <DialogHeader>
          <DialogTitle>{t("otp_dialog_title")}</DialogTitle>
          <div id="otp-dialog-description" className="text-muted-foreground text-sm">
            {t("otp_dialog_description")} <strong>{identifier}</strong>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="otp-input">{t("otp_label")}</FormLabel>
            <Input
              id="otp-input"
              type="text"
              placeholder={t("otp_placeholder")}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              className="text-center font-mono text-lg tracking-widest"
              aria-required="true"
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => onVerify(otp)}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? t("verifying") : t("verify_otp")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TotpDialog({
  open,
  onOpenChange,
  onVerify,
  onUseBackupCode,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (code: string) => void;
  onUseBackupCode: () => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
  const [totpCode, setTotpCode] = useState("");
  useEffect(() => {
    if (open) setTotpCode("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="totp-dialog-description">
        <DialogHeader>
          <DialogTitle>{t("totp_dialog_title")}</DialogTitle>
          <div id="totp-dialog-description" className="text-muted-foreground text-sm">
            {t("totp_dialog_description")}
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="totp-input">{t("totp_label")}</FormLabel>
            <Input
              id="totp-input"
              type="text"
              placeholder={t("otp_placeholder")}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              className="text-center font-mono text-lg tracking-widest"
              aria-required="true"
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => onVerify(totpCode)}
              disabled={isLoading || totpCode.length !== 6}
            >
              {isLoading ? t("verifying") : t("verify_totp")}
            </Button>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm underline"
            onClick={onUseBackupCode}
          >
            {t("use_backup_code")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackupCodeDialog({
  open,
  onOpenChange,
  backupCode,
  onBackupCodeChange,
  onVerify,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backupCode: string;
  onBackupCodeChange: (value: string) => void;
  onVerify: () => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
  const isValidFormat = /^[0-9A-Fa-f\s-]*$/.test(backupCode) && backupCode.replace(/\s|-/g, "").length === 16;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="backup-code-dialog-description">
        <DialogHeader>
          <DialogTitle>{t("backup_code_dialog_title")}</DialogTitle>
          <div id="backup-code-dialog-description" className="text-muted-foreground text-sm">
            {t("backup_code_dialog_description")}
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="backup-code-input">{t("backup_code_label")}</FormLabel>
            <Input
              id="backup-code-input"
              type="text"
              placeholder={t("backup_code_placeholder")}
              value={backupCode}
              onChange={(e) => onBackupCodeChange(e.target.value)}
              maxLength={17}
              className="text-center font-mono tracking-widest uppercase"
              aria-required="true"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onBackupCodeChange("");
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" className="flex-1" onClick={onVerify} disabled={isLoading || !isValidFormat}>
              {isLoading ? t("verifying") : t("verify_backup_code")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SmsDialogWithBackup({
  open,
  onOpenChange,
  onVerify,
  onUseBackupCode,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (code: string) => void;
  onUseBackupCode: () => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
  const [smsCode, setSmsCode] = useState("");
  useEffect(() => {
    if (open) setSmsCode("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="sms-dialog-description">
        <DialogHeader>
          <DialogTitle>{t("sms_dialog_title")}</DialogTitle>
          <div id="sms-dialog-description" className="text-muted-foreground text-sm">
            {t("sms_dialog_description")}
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="sms-input">{t("sms_label")}</FormLabel>
            <Input
              id="sms-input"
              type="text"
              placeholder={t("otp_placeholder")}
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              className="text-center font-mono text-lg tracking-widest"
              aria-required="true"
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={() => onVerify(smsCode)}
              disabled={isLoading || smsCode.length !== 6}
            >
              {isLoading ? t("verifying") : t("verify_sms")}
            </Button>
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm underline"
            onClick={onUseBackupCode}
          >
            {t("use_backup_code")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const POST_LOGIN_REDIRECT_COOKIE = "post_login_redirect";

/** Only allow redirects back to first-party aiagents-hub.vn hosts. */
function sanitizeHubRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && url.hostname.endsWith("aiagents-hub.vn")) {
      return url.toString();
    }
  } catch {
    /* invalid url */
  }
  return null;
}

function writePostLoginRedirectCookie(value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${POST_LOGIN_REDIRECT_COOKIE}=${encodeURIComponent(value)}; path=/; domain=.aiagents-hub.vn; max-age=600; secure; samesite=lax`;
}

function readPostLoginRedirectCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${POST_LOGIN_REDIRECT_COOKIE}=([^;]*)`));
  if (!match) return null;
  return sanitizeHubRedirect(decodeURIComponent(match[1] ?? ""));
}

function clearPostLoginRedirectCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${POST_LOGIN_REDIRECT_COOKIE}=; path=/; domain=.aiagents-hub.vn; max-age=0`;
}

export function LoginForm() {
  const t = useTranslations("LoginForm");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref");
  const [showOtpPopup, setShowOtpPopup] = useState(false);
  const [showTotpPopup, setShowTotpPopup] = useState(false);
  const [showSmsPopup, setShowSmsPopup] = useState(false);
  const [showBackupCodePopup, setShowBackupCodePopup] = useState(false);
  const [showRecoverSection, setShowRecoverSection] = useState(false);
  const [recoverBackupCode, setRecoverBackupCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState<{ enabled: boolean } | null>(null);
  const [usePasskeyMode, setUsePasskeyMode] = useState(false);
  const redirectTarget = searchParams.get("redirect");
  const isMounted = useRef(true);

  // Persist the post-login redirect so it survives OAuth round-trips and the
  // TOTP/SMS step (which return to /auth/v3/login without the query param).
  useEffect(() => {
    const safe = sanitizeHubRedirect(redirectTarget);
    if (safe) writePostLoginRedirectCookie(safe);
  }, [redirectTarget]);

  const navigateAfterLogin = useCallback(() => {
    const target = sanitizeHubRedirect(redirectTarget) ?? readPostLoginRedirectCookie();
    if (target) {
      clearPostLoginRedirectCookie();
      window.location.href = target;
      return;
    }
    router.push("/dashboard");
  }, [redirectTarget, router]);

  const language = locale.startsWith("vi") ? "vi" : "en";

  const captcha = useHumanChallenge({
    authApiUrl: AUTH_API_URL,
    scope: "preauth",
    envFallbackSiteKey: ENV_TURNSTILE_SITE_KEY,
    onCaptchaLoadError: () => toast.error(t("captcha_load_error")),
  });
  const passkeySupported = typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";

  const FormSchema = z.object({
    email: z
      .string()
      .min(1, { message: t("email_required") })
      .email({ message: t("email_invalid") }),
  });

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Xử lý 2FA khi quay về từ OAuth (Google, Facebook, Github) hoặc WalletConnect
  useEffect(() => {
    const requiresTotp = searchParams.get("requiresTotp");
    const requiresSms = searchParams.get("requiresSms");
    const rateLimited = searchParams.get("rateLimited");
    const retryAfterRaw = searchParams.get("retryAfter");
    if (requiresTotp === "1") {
      setShowTotpPopup(true);
    } else if (requiresSms === "1") {
      setShowSmsPopup(true);
    }
    if (rateLimited === "1") {
      const seconds = retryAfterRaw ? Number(retryAfterRaw) : NaN;
      if (Number.isFinite(seconds) && seconds > 0) {
        toast.error(t("rate_limit_retry_after", { seconds: Math.ceil(seconds) }));
      } else {
        toast.error(t("rate_limit_generic"));
      }
    }
  }, [searchParams]);

  const fetchPasskeyStatus = useCallback(async (email: string) => {
    if (!email.trim()) return;
    try {
      const res = await fetch(`${AUTH_API_URL}/passkey/auth/status?identifier=${encodeURIComponent(email.trim())}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { enabled?: boolean };
        setPasskeyStatus({ enabled: Boolean(data.enabled) });
      } else {
        setPasskeyStatus({ enabled: false });
      }
    } catch {
      setPasskeyStatus({ enabled: false });
    }
  }, []);

  const debouncedFetchPasskey = useCallback(
    debounce((email: unknown) => {
      if (isMounted.current && typeof email === "string") fetchPasskeyStatus(email);
    }, 400),
    [fetchPasskeyStatus],
  );

  const handlePasskeyLogin = useCallback(
    async (emailValue?: string) => {
      const email = emailValue ?? form.getValues("email")?.trim();
      if (!email) {
        toast.error(t("email_required"));
        return;
      }
      if (!passkeySupported) {
        toast.error(t("passkey_not_supported"));
        return;
      }

      setIsLoading(true);
      setUsePasskeyMode(true);
      try {
        const optRes = await fetch(`${AUTH_API_URL}/passkey/auth/options`, {
          method: "POST",
          credentials: "include",
          headers: authJsonHeaders(),
          body: JSON.stringify({ identifier: email }),
        });
        if (!optRes.ok) {
          const err = (await optRes.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
          throw new Error(formatAuthApiErrorMessage(err, t("passkey_error"), t, optRes.status));
        }

        const { options, challengeKey } = (await optRes.json()) as {
          options?: AuthOptionsJSON;
          challengeKey?: string;
        };
        if (!options || !challengeKey) throw new Error(t("passkey_error"));

        const response = await startAuthentication(options);
        const verifyRes = await fetch(`${AUTH_API_URL}/passkey/auth/verify`, {
          method: "POST",
          credentials: "include",
          headers: authJsonHeaders(),
          body: JSON.stringify({ response, identifier: email, challengeKey }),
        });
        const verifyData = (await verifyRes.json().catch(() => ({}))) as {
          ok?: boolean;
          requiresTotp?: boolean;
          requiresSms?: boolean;
          error?: string;
          retryAfter?: number;
        };

        if (verifyData.requiresTotp) {
          setShowOtpPopup(false);
          setShowTotpPopup(true);
          toast.success(t("totp_required"));
          return;
        }
        if (verifyData.requiresSms) {
          setShowOtpPopup(false);
          setShowSmsPopup(true);
          toast.success(t("sms_required"));
          return;
        }

        if (!verifyRes.ok) {
          throw new Error(
            formatAuthApiErrorMessage(verifyData, t("passkey_error"), t, verifyRes.status),
          );
        }
        if (!verifyData.ok) throw new Error(t("passkey_error"));

        form.reset();
        navigateAfterLogin();
      } catch (error) {
        if (isMounted.current) {
          const msg = error instanceof Error ? error.message : t("passkey_error");
          const isCancel = msg.includes("cancel") || msg.includes("abort") || msg.includes("NotAllowed");
          if (isCancel) {
            toast.info(t("passkey_cancelled"));
          } else {
            toast.error(msg);
          }
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          setUsePasskeyMode(false);
        }
      }
    },
    [form, passkeySupported, router, t],
  );

  const handleOtpVerify = useCallback(
    async (code: string) => {
      if (!/^\d{6}$/.test(code)) {
        toast.error(t("otp_invalid"));
        return;
      }
      setIsLoading(true);
      try {
        const body: { identifier: string; otp: string; ref?: string } = {
          identifier: identifier.trim(),
          otp: code,
        };
        if (refFromUrl) body.ref = refFromUrl;
        const response = await fetch(`${AUTH_API_URL}/otp/verify`, {
          method: "POST",
          headers: authJsonHeaders(),
          body: JSON.stringify(body),
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as {
          requiresTotp?: boolean;
          requiresSms?: boolean;
          error?: string;
          retryAfter?: number;
        };

        if (data.requiresTotp) {
          setShowOtpPopup(false);
          setShowTotpPopup(true);
          toast.success(t("totp_required"));
        } else if (data.requiresSms) {
          setShowOtpPopup(false);
          setShowSmsPopup(true);
          toast.success(t("sms_required"));
        } else if (response.ok) {
          setShowOtpPopup(false);
          form.reset();
          navigateAfterLogin();
        } else {
          throw new Error(
            formatAuthApiErrorMessage(data, t("otp_verify_error"), t, response.status),
          );
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("otp_verify_error"));
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    [identifier, form, refFromUrl, router, t],
  );

  const handleSmsVerify = useCallback(
    async (code: string) => {
      if (!/^\d{6}$/.test(code)) {
        toast.error(t("otp_invalid"));
        return;
      }
      setIsLoading(true);
      try {
        const response = await fetch(`${AUTH_API_URL}/sms/verify-login`, {
          method: "POST",
          headers: authJsonHeaders(),
          body: JSON.stringify({ code }),
          credentials: "include",
        });
        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
          throw new Error(formatAuthApiErrorMessage(err, t("sms_verify_error"), t, response.status));
        }
        setShowSmsPopup(false);
        form.reset();
        navigateAfterLogin();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sms_verify_error"));
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    [form, router, t],
  );

  const handleTotpVerify = useCallback(
    async (code: string) => {
      if (!/^\d{6}$/.test(code)) {
        toast.error(t("otp_invalid"));
        return;
      }
      setIsLoading(true);
      try {
        const response = await fetch(`${AUTH_API_URL}/totp/verify`, {
          method: "POST",
          headers: authJsonHeaders(),
          body: JSON.stringify({ code }),
          credentials: "include",
        });
        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
          throw new Error(formatAuthApiErrorMessage(err, t("totp_verify_error"), t, response.status));
        }
        setShowTotpPopup(false);
        form.reset();
        navigateAfterLogin();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("totp_verify_error"));
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    [form, router, t],
  );

  const handleBackupCodeVerify = useCallback(async () => {
    const normalized = backupCode.replace(/\s/g, "").replace(/-/g, "").toUpperCase();
    if (!/^[0-9A-F]{16}$/.test(normalized)) {
      toast.error(t("backup_code_verify_error"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/backup-code/verify`, {
        method: "POST",
        headers: authJsonHeaders(),
        body: JSON.stringify({ code: normalized }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
        throw new Error(formatAuthApiErrorMessage(err, t("backup_code_verify_error"), t, response.status));
      }
      setShowBackupCodePopup(false);
      setShowTotpPopup(false);
      setShowSmsPopup(false);
      setBackupCode("");
      form.reset();
      navigateAfterLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("backup_code_verify_error"));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [backupCode, form, router, t]);

  const handleUseBackupCode = useCallback(() => {
    setShowTotpPopup(false);
    setShowSmsPopup(false);
    setShowBackupCodePopup(true);
  }, []);

  const handleRecoverWithBackupCode = useCallback(
    async (emailValue: string) => {
      const email = emailValue?.trim() ?? form.getValues("email")?.trim();
      if (!email) {
        toast.error(t("email_required"));
        return;
      }
      const normalized = recoverBackupCode.replace(/\s/g, "").replace(/-/g, "").toUpperCase();
      if (!/^[0-9A-F]{16}$/.test(normalized)) {
        toast.error(t("backup_code_verify_error"));
        return;
      }
      if (captcha.needsTokenBeforeSubmit) {
        toast.error(t("captcha_required"));
        return;
      }
      setIsLoading(true);
      try {
        const body: { identifier: string; code: string; turnstileToken?: string } = {
          identifier: email,
          code: normalized,
        };
        const token = captcha.turnstileTokenForBody();
        if (token) body.turnstileToken = token;
        const response = await fetch(`${AUTH_API_URL}/backup-code/recover`, {
          method: "POST",
          headers: authJsonHeaders(),
          body: JSON.stringify(body),
          credentials: "include",
        });
        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as {
            error?: string;
            retryAfter?: number;
            requiresCaptcha?: boolean;
            siteKey?: string | null;
          };
          captcha.applyCaptchaError(err);
          throw new Error(
            formatAuthApiErrorMessage(err, t("backup_code_verify_error"), t, response.status),
          );
        }
        await captcha.onRequestSuccess();
        setShowRecoverSection(false);
        setRecoverBackupCode("");
        form.reset();
        navigateAfterLogin();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("backup_code_verify_error"));
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    [recoverBackupCode, form, router, t, captcha],
  );

  const onSubmit = useCallback(
    async (data: z.infer<typeof FormSchema>) => {
      if (!isMounted.current) return;
      if (captcha.needsTokenBeforeSubmit) {
        toast.error(t("captcha_required"));
        return;
      }
      setIsLoading(true);
      try {
        const body: { identifier: string; language?: string; ref?: string; turnstileToken?: string } = {
          identifier: data.email.trim(),
          language,
        };
        if (refFromUrl) body.ref = refFromUrl;
        const token = captcha.turnstileTokenForBody();
        if (token) body.turnstileToken = token;
        const res = await fetch(`${AUTH_API_URL}/otp/request`, {
          method: "POST",
          headers: authJsonHeaders(),
          body: JSON.stringify(body),
          credentials: "include",
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            retryAfter?: number;
            requiresCaptcha?: boolean;
            siteKey?: string | null;
          };
          captcha.applyCaptchaError(errBody);
          throw new Error(formatAuthApiErrorMessage(errBody, t("otp_send_error"), t, res.status));
        }
        await captcha.onRequestSuccess();
        if (isMounted.current) {
          setIdentifier(data.email.trim());
          setShowOtpPopup(true);
          toast.success(t("otp_sent_success"));
        }
      } catch (error) {
        if (isMounted.current) {
          toast.error(error instanceof Error ? error.message : t("otp_send_error"));
        }
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    [language, refFromUrl, t, captcha],
  );

  const handleBackupCodeChange = useCallback((value: string) => {
    if (isMounted.current) {
      const cleaned = value.replace(/[^0-9A-Fa-f-]/g, "").slice(0, 17);
      setBackupCode(cleaned);
    }
  }, []);

  const email = form.watch("email");
  useEffect(() => {
    const trimmed = email?.trim();
    if (trimmed) debouncedFetchPasskey(trimmed);
    else setPasskeyStatus(null);
  }, [email, debouncedFetchPasskey]);

  const showPasskeyOption = passkeySupported && Boolean(passkeyStatus?.enabled);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="email">{t("email_label")}</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("email_placeholder")}
                  autoComplete="email webauthn"
                  aria-required="true"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showPasskeyOption && (
          <Button
            type="button"
            variant="default"
            className="w-full"
            disabled={isLoading || !form.formState.isValid}
            onClick={() => handlePasskeyLogin()}
          >
            <Fingerprint className="mr-2 size-4" />
            {isLoading && usePasskeyMode ? t("passkey_authenticating") : t("use_passkey")}
          </Button>
        )}

        {passkeySupported && !showPasskeyOption && passkeyStatus !== null && (
          <p className="text-muted-foreground text-xs">{t("passkey_no_credentials")}</p>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background text-muted-foreground px-2">{t("or_continue_with")}</span>
          </div>
        </div>

        {!showRecoverSection ? <HumanChallengeTurnstile challenge={captcha} keyPrefix="otp-" /> : null}

        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={
            isLoading ||
            !form.formState.isValid ||
            (!showRecoverSection && captcha.needsTokenBeforeSubmit)
          }
        >
          {isLoading && !usePasskeyMode ? t("sending_otp") : t("login_with_otp")}
        </Button>

        {!showRecoverSection ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-sm underline"
            onClick={() => {
              captcha.resetWidget();
              setShowRecoverSection(true);
            }}
          >
            {t("recover_with_backup_code")}
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">{t("recover_with_backup_code_desc")}</p>
            <div className="space-y-2">
              <FormLabel htmlFor="recover-email">{t("email_label")}</FormLabel>
              <Input
                id="recover-email"
                type="email"
                placeholder={t("email_placeholder")}
                value={form.watch("email")}
                onChange={(e) => form.setValue("email", e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="recover-backup-code">{t("backup_code_label")}</FormLabel>
              <Input
                id="recover-backup-code"
                type="text"
                placeholder={t("backup_code_placeholder")}
                value={recoverBackupCode}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9A-Fa-f-]/g, "").slice(0, 17);
                  setRecoverBackupCode(cleaned);
                }}
                className="font-mono tracking-widest uppercase"
                disabled={isLoading}
              />
            </div>
            <HumanChallengeTurnstile challenge={captcha} keyPrefix="recover-" />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRecoverSection(false);
                  setRecoverBackupCode("");
                  captcha.resetWidget();
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  isLoading ||
                  !form.watch("email")?.trim() ||
                  recoverBackupCode.replace(/\s|-/g, "").length !== 16 ||
                  captcha.needsTokenBeforeSubmit
                }
                onClick={() => handleRecoverWithBackupCode(form.getValues("email"))}
              >
                {isLoading ? t("verifying") : t("verify_backup_code")}
              </Button>
            </div>
          </div>
        )}
      </form>

      <OtpDialog
        open={showOtpPopup}
        onOpenChange={setShowOtpPopup}
        identifier={identifier}
        onVerify={handleOtpVerify}
        isLoading={isLoading}
        t={t}
      />

      <TotpDialog
        open={showTotpPopup}
        onOpenChange={setShowTotpPopup}
        onVerify={handleTotpVerify}
        onUseBackupCode={handleUseBackupCode}
        isLoading={isLoading}
        t={t}
      />

      <SmsDialogWithBackup
        open={showSmsPopup}
        onOpenChange={setShowSmsPopup}
        onVerify={handleSmsVerify}
        onUseBackupCode={handleUseBackupCode}
        isLoading={isLoading}
        t={t}
      />

      <BackupCodeDialog
        open={showBackupCodePopup}
        onOpenChange={(open) => {
          if (!open) setBackupCode("");
          setShowBackupCodePopup(open);
        }}
        backupCode={backupCode}
        onBackupCodeChange={handleBackupCodeChange}
        onVerify={handleBackupCodeVerify}
        isLoading={isLoading}
        t={t}
      />
    </FormProvider>
  );
}
