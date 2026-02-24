"use client";

/* eslint-disable complexity, max-lines, space-before-function-paren, react-hooks/exhaustive-deps, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-type-assertion -- Login form has multiple auth flows */

import { useState, useCallback, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type AuthOptionsJSON = Parameters<typeof startAuthentication>[0];

const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.unitoken.trade/dashboard/auth";

function debounce<T extends (...args: never[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface ErrorResponse {
  error?: string;
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const errorData: ErrorResponse = await response.json();
    return errorData.error ?? fallback;
  } catch {
    return fallback;
  }
}

function OtpDialog({
  open,
  onOpenChange,
  identifier,
  otp,
  onOtpChange,
  onVerify,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identifier: string;
  otp: string;
  onOtpChange: (value: string) => void;
  onVerify: () => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
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
              onChange={(e) => onOtpChange(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              className="text-center font-mono text-lg tracking-widest"
              aria-required="true"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" className="flex-1" onClick={onVerify} disabled={isLoading || otp.length !== 6}>
              {isLoading ? t("verifying") : t("verify_otp")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SmsDialog({
  open,
  onOpenChange,
  smsCode,
  onSmsCodeChange,
  onVerify,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  smsCode: string;
  onSmsCodeChange: (value: string) => void;
  onVerify: () => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
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
              onChange={(e) => onSmsCodeChange(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              className="text-center font-mono text-lg tracking-widest"
              aria-required="true"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onSmsCodeChange("");
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" className="flex-1" onClick={onVerify} disabled={isLoading || smsCode.length !== 6}>
              {isLoading ? t("verifying") : t("verify_sms")}
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
  totpCode,
  onTotpChange,
  onVerify,
  isLoading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totpCode: string;
  onTotpChange: (value: string) => void;
  onVerify: () => void;
  isLoading: boolean;
  t: (key: string) => string;
}) {
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
              onChange={(e) => onTotpChange(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              className="text-center font-mono text-lg tracking-widest"
              aria-required="true"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onTotpChange("");
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="button" className="flex-1" onClick={onVerify} disabled={isLoading || totpCode.length !== 6}>
              {isLoading ? t("verifying") : t("verify_totp")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LoginForm() {
  const t = useTranslations("LoginForm");
  const locale = useLocale();
  const router = useRouter();
  const [showOtpPopup, setShowOtpPopup] = useState(false);
  const [showTotpPopup, setShowTotpPopup] = useState(false);
  const [showSmsPopup, setShowSmsPopup] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState<{ enabled: boolean } | null>(null);
  const [usePasskeyMode, setUsePasskeyMode] = useState(false);
  const isMounted = useRef(true);

  const language = locale.startsWith("vi") ? "vi" : "en";
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: email }),
        });
        if (!optRes.ok) {
          const err = (await optRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? t("passkey_error"));
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response, identifier: email, challengeKey }),
        });
        if (!verifyRes.ok) {
          const err = (await verifyRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? t("passkey_error"));
        }

        const data = (await verifyRes.json()) as { ok?: boolean };
        if (!data.ok) throw new Error(t("passkey_error"));

        form.reset();
        router.push("/dashboard");
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

  const handleOtpVerify = useCallback(async () => {
    if (!/^\d{6}$/.test(otp)) {
      toast.error(t("otp_invalid"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), otp }),
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as {
        requiresTotp?: boolean;
        requiresSms?: boolean;
        error?: string;
      };

      if (data.requiresTotp) {
        setShowOtpPopup(false);
        setShowTotpPopup(true);
        setOtp("");
        toast.success(t("totp_required"));
      } else if (data.requiresSms) {
        setShowOtpPopup(false);
        setShowSmsPopup(true);
        setOtp("");
        toast.success(t("sms_required"));
      } else if (response.ok) {
        setShowOtpPopup(false);
        setOtp("");
        form.reset();
        router.push("/dashboard");
      } else {
        const errMsg = data.error ?? (await getErrorMessage(response, t("unexpected_error")));
        throw new Error(errMsg);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("otp_verify_error"));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [otp, identifier, form, router, t]);

  const handleSmsVerify = useCallback(async () => {
    if (!/^\d{6}$/.test(smsCode)) {
      toast.error(t("otp_invalid"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/sms/verify-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: smsCode }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("sms_verify_error"));
      }
      setShowSmsPopup(false);
      setSmsCode("");
      form.reset();
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sms_verify_error"));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [smsCode, form, router, t]);

  const handleTotpVerify = useCallback(async () => {
    if (!/^\d{6}$/.test(totpCode)) {
      toast.error(t("otp_invalid"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${AUTH_API_URL}/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? t("totp_verify_error"));
      }
      setShowTotpPopup(false);
      setTotpCode("");
      form.reset();
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("totp_verify_error"));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [totpCode, form, router, t]);

  const onSubmit = useCallback(
    async (data: z.infer<typeof FormSchema>) => {
      if (!isMounted.current) return;
      setIsLoading(true);
      try {
        const res = await fetch(`${AUTH_API_URL}/otp/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: data.email.trim(), language }),
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(await getErrorMessage(res, t("unexpected_error")));
        }
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
    [language, t],
  );

  const handleOtpChange = useCallback(
    debounce((value: string) => {
      if (isMounted.current) {
        setOtp(value.replace(/\D/g, "").slice(0, 6));
      }
    }, 300),
    [],
  );

  const handleTotpChange = useCallback(
    debounce((value: string) => {
      if (isMounted.current) {
        setTotpCode(value.replace(/\D/g, "").slice(0, 6));
      }
    }, 300),
    [],
  );

  const handleSmsCodeChange = useCallback(
    debounce((value: string) => {
      if (isMounted.current) {
        setSmsCode(value.replace(/\D/g, "").slice(0, 6));
      }
    }, 300),
    [],
  );

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

        <Button type="submit" variant="outline" className="w-full" disabled={isLoading || !form.formState.isValid}>
          {isLoading && !usePasskeyMode ? t("sending_otp") : t("login_with_otp")}
        </Button>
      </form>

      <OtpDialog
        open={showOtpPopup}
        onOpenChange={(open) => {
          if (!open) setOtp("");
          setShowOtpPopup(open);
        }}
        identifier={identifier}
        otp={otp}
        onOtpChange={handleOtpChange}
        onVerify={handleOtpVerify}
        isLoading={isLoading}
        t={t}
      />

      <TotpDialog
        open={showTotpPopup}
        onOpenChange={(open) => {
          if (!open) setTotpCode("");
          setShowTotpPopup(open);
        }}
        totpCode={totpCode}
        onTotpChange={handleTotpChange}
        onVerify={handleTotpVerify}
        isLoading={isLoading}
        t={t}
      />

      <SmsDialog
        open={showSmsPopup}
        onOpenChange={(open) => {
          if (!open) setSmsCode("");
          setShowSmsPopup(open);
        }}
        smsCode={smsCode}
        onSmsCodeChange={handleSmsCodeChange}
        onVerify={handleSmsVerify}
        isLoading={isLoading}
        t={t}
      />
    </FormProvider>
  );
}
