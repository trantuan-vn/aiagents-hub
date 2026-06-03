"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SiweMessage } from "siwe";
import { useAccount, useChainId, useConnect, useSignMessage } from "wagmi";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { HumanChallengeTurnstile, useHumanChallenge } from "@/hooks/use-human-challenge";

import { STEP_UP_SESSION_KEY } from "../_components/sensitive-step-up";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";
const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn/dashboard/auth";
const ENV_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
/** EIP-4361 statement must be ASCII-only and stable for audit trails. */
const STEP_UP_SIWE_STATEMENT = "Step-up for sensitive action authorization.";

type StepUpMethod =
  | "passkey"
  | "authenticator"
  | "sms"
  | "otp_email"
  | "wallet_reauth"
  | "facebook_oauth";
type AuthOptionsJSON = Parameters<typeof startAuthentication>[0];

export default function StepUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations("DashboardStepUpPage");
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isWalletConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId() || 1;

  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [availableMethods, setAvailableMethods] = useState<StepUpMethod[]>([]);
  const [activeMethod, setActiveMethod] = useState<StepUpMethod | null>(null);
  const [challengeKey, setChallengeKey] = useState<string | null>(null);
  const [passkeyOptions, setPasskeyOptions] = useState<AuthOptionsJSON | null>(null);
  const [walletNonce, setWalletNonce] = useState<string | null>(null);
  const [facebookAuthUrl, setFacebookAuthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const captcha = useHumanChallenge({
    authApiUrl: AUTH_API_URL,
    scope: "session",
    envFallbackSiteKey: ENV_TURNSTILE_SITE_KEY,
  });
  const didAutoLoadRef = useRef(false);
  const pendingWalletVerifyRef = useRef(false);
  const walletVerifyInFlightRef = useRef(false);

  const returnTo = useMemo(() => {
    const q = searchParams.get("returnTo");
    if (!q || !q.startsWith("/dashboard")) return "/dashboard";
    return q;
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("stepUpOauth") !== "success") return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        STEP_UP_SESSION_KEY,
        JSON.stringify({ path: returnTo, at: Date.now() }),
      );
    }
    toast({ title: t("verification_successful") });
    router.replace(returnTo);
  }, [returnTo, router, searchParams, t, toast]);

  const methodLabel = useCallback(
    (method: StepUpMethod) => {
      if (method === "passkey") return t("method_passkey");
      if (method === "authenticator") return t("method_authenticator");
      if (method === "sms") return t("method_sms");
      if (method === "otp_email") return t("method_otp_email");
      if (method === "wallet_reauth") return t("method_wallet_signature");
      if (method === "facebook_oauth") return t("method_facebook_reauth");
      return t("method_verification");
    },
    [t],
  );

  const resetChallenge = useCallback(() => {
    setActiveMethod(null);
    setPasskeyOptions(null);
    setChallengeKey(null);
    setWalletNonce(null);
    setFacebookAuthUrl(null);
    setCode("");
  }, []);

  const loadAvailableMethods = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/dashboard/auth/step-up/request`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      availableMethods?: StepUpMethod[];
      error?: string;
    };
    if (!res.ok || !data.availableMethods?.length) {
      throw new Error(data.error ?? t("failed_to_request_verification"));
    }
    setAvailableMethods(data.availableMethods);
    return data.availableMethods;
  }, [returnTo, t]);

  const requestStepUp = useCallback(
    async (method: StepUpMethod) => {
      setRequesting(true);
      try {
        const turnstileToken = captcha.turnstileTokenForBody();
        const res = await fetch(`${API_BASE_URL}/dashboard/auth/step-up/request`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            ...(turnstileToken ? { turnstileToken } : {}),
            returnTo,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          availableMethods?: StepUpMethod[];
          requiredMethod?: StepUpMethod;
          options?: AuthOptionsJSON;
          challengeKey?: string;
          nonce?: string;
          authUrl?: string;
          requiresCaptcha?: boolean;
          siteKey?: string | null;
          error?: string;
        };
        if (!res.ok || !data.requiredMethod) {
          captcha.applyCaptchaError(data);
          if (data.requiresCaptcha) {
            setActiveMethod((prev) => prev ?? method);
          }
          throw new Error(data.error ?? t("failed_to_request_verification"));
        }
        if (data.availableMethods?.length) {
          setAvailableMethods(data.availableMethods);
        }
        setActiveMethod(data.requiredMethod);
        setPasskeyOptions(data.options ?? null);
        setChallengeKey(data.challengeKey ?? null);
        setWalletNonce(data.nonce ?? null);
        setFacebookAuthUrl(data.authUrl ?? null);
        setCode("");
        if (data.requiredMethod === "otp_email") {
          toast({ title: t("email_otp_sent") });
          await captcha.onRequestSuccess();
        } else if (data.requiredMethod === "sms") {
          toast({ title: t("sms_otp_sent") });
        }
      } catch (e) {
        toast({
          title: t("cannot_start_verification"),
          description: e instanceof Error ? e.message : t("please_try_again"),
          variant: "destructive",
        });
      } finally {
        setRequesting(false);
        setLoading(false);
      }
    },
    [captcha, returnTo, t, toast],
  );

  const requestStepUpFromUser = useCallback(
    async (method: StepUpMethod) => {
      if (method === "otp_email" && captcha.needsTokenBeforeSubmit) {
        toast({
          title: t("captcha_required"),
          description: t("complete_captcha_to_continue"),
          variant: "destructive",
        });
        return;
      }
      await requestStepUp(method);
    },
    [captcha.needsTokenBeforeSubmit, requestStepUp, t, toast],
  );

  const selectMethod = useCallback(
    async (method: StepUpMethod) => {
      if (requesting) return;
      resetChallenge();
      await requestStepUpFromUser(method);
    },
    [requestStepUpFromUser, requesting, resetChallenge],
  );

  useEffect(() => {
    if (didAutoLoadRef.current) return;
    if (!captcha.configLoaded) return;
    if (captcha.needsTokenBeforeSubmit) return;
    didAutoLoadRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const methods = await loadAvailableMethods();
        if (cancelled) return;
        if (methods.length === 1) {
          await requestStepUp(methods[0]!);
        } else {
          setLoading(false);
        }
      } catch (e) {
        if (cancelled) return;
        toast({
          title: t("cannot_start_verification"),
          description: e instanceof Error ? e.message : t("please_try_again"),
          variant: "destructive",
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captcha.configLoaded, captcha.needsTokenBeforeSubmit, loadAvailableMethods, requestStepUp, t, toast]);

  const verifyWalletStepUp = useCallback(async () => {
    if (!walletNonce) throw new Error(t("wallet_challenge_missing"));
    if (!address) throw new Error(t("wallet_account_not_selected"));
    if (walletVerifyInFlightRef.current) return;
    walletVerifyInFlightRef.current = true;
    try {
      setVerifying(true);
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address,
        statement: STEP_UP_SIWE_STATEMENT,
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce: walletNonce,
        issuedAt: new Date().toISOString(),
      });
      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/dashboard/auth/step-up/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "wallet_reauth",
          message,
          signature: signature.startsWith("0x") ? signature : `0x${signature}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("verification_failed"));

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          STEP_UP_SESSION_KEY,
          JSON.stringify({ path: returnTo, at: Date.now() }),
        );
      }
      toast({ title: t("verification_successful") });
      router.replace(returnTo);
    } finally {
      setVerifying(false);
      walletVerifyInFlightRef.current = false;
    }
  }, [address, chainId, returnTo, router, signMessageAsync, t, toast, walletNonce]);

  const handleWalletReauth = useCallback(async () => {
    if (isConnected && address) {
      await verifyWalletStepUp();
      return;
    }
    pendingWalletVerifyRef.current = true;
    const injectedConnector = connectors.find((c) => c.id === "injected");
    const walletConnectConnector = connectors.find((c) => c.id === "walletConnect");
    if (injectedConnector && typeof window !== "undefined" && window.ethereum) {
      toast({ title: t("open_wallet_accept") });
      await connect({ connector: injectedConnector });
      return;
    }
    if (walletConnectConnector) {
      toast({ title: t("opening_walletconnect") });
      await connect({ connector: walletConnectConnector });
      return;
    }
    pendingWalletVerifyRef.current = false;
    throw new Error(t("no_wallet_found"));
  }, [address, connect, connectors, isConnected, t, toast, verifyWalletStepUp]);

  useEffect(() => {
    if (!pendingWalletVerifyRef.current || !isConnected || !address || activeMethod !== "wallet_reauth") return;
    pendingWalletVerifyRef.current = false;
    void verifyWalletStepUp().catch((e) => {
      toast({
        title: t("verification_failed"),
        description: e instanceof Error ? e.message : t("please_try_again"),
        variant: "destructive",
      });
    });
  }, [activeMethod, address, isConnected, t, toast, verifyWalletStepUp]);

  const verify = useCallback(async () => {
    if (!activeMethod || verifying) return;
    setVerifying(true);
    try {
      let body: Record<string, unknown> = { method: activeMethod };

      if (activeMethod === "passkey") {
        if (!passkeyOptions || !challengeKey) throw new Error(t("passkey_challenge_missing"));
        const response = await startAuthentication(passkeyOptions);
        body = { ...body, response, challengeKey };
      } else if (activeMethod === "wallet_reauth") {
        await handleWalletReauth();
        return;
      } else if (activeMethod === "facebook_oauth") {
        if (!facebookAuthUrl) throw new Error(t("facebook_reauth_url_missing"));
        window.location.href = facebookAuthUrl;
        return;
      } else {
        const normalized = code.replace(/\D/g, "").slice(0, 6);
        if (normalized.length !== 6) throw new Error(t("code_must_be_6_digits"));
        body = { ...body, code: normalized };
      }

      const res = await fetch(`${API_BASE_URL}/dashboard/auth/step-up/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? t("verification_failed"));
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          STEP_UP_SESSION_KEY,
          JSON.stringify({ path: returnTo, at: Date.now() }),
        );
      }
      toast({ title: t("verification_successful") });
      router.replace(returnTo);
    } catch (e) {
      toast({
        title: t("verification_failed"),
        description: e instanceof Error ? e.message : t("please_try_again"),
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  }, [
    activeMethod,
    challengeKey,
    code,
    facebookAuthUrl,
    passkeyOptions,
    returnTo,
    router,
    t,
    toast,
    verifying,
    handleWalletReauth,
  ]);

  const showMethodPicker = !loading && availableMethods.length > 1 && !activeMethod;
  const activeMethodLabel = activeMethod ? methodLabel(activeMethod) : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showMethodPicker ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("choose_method")}</p>
              <div className="flex flex-col gap-2">
                {availableMethods.map((method) => (
                  <Button
                    key={method}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => void selectMethod(method)}
                    disabled={requesting}
                  >
                    {methodLabel(method)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {activeMethod ? (
            <Alert>
              <AlertTitle>{t("active_method")}</AlertTitle>
              <AlertDescription>{activeMethodLabel}</AlertDescription>
            </Alert>
          ) : !showMethodPicker ? (
            <Alert>
              <AlertTitle>{t("required_method")}</AlertTitle>
              <AlertDescription>{loading ? t("loading") : t("method_verification")}</AlertDescription>
            </Alert>
          ) : null}

          {availableMethods.length > 1 && activeMethod ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => resetChallenge()}
              disabled={requesting || verifying}
            >
              {t("change_method")}
            </Button>
          ) : null}

          {!loading && activeMethod === "passkey" ? (
            <Button className="w-full" onClick={() => void verify()} disabled={verifying || requesting}>
              {verifying ? t("verifying") : t("verify_with_passkey")}
            </Button>
          ) : null}

          {!loading && activeMethod === "wallet_reauth" ? (
            <Button
              className="w-full"
              onClick={() => void verify()}
              disabled={verifying || requesting || isWalletConnecting}
            >
              {isWalletConnecting
                ? t("connecting_wallet")
                : verifying
                  ? t("verifying")
                  : t("verify_with_wallet_signature")}
            </Button>
          ) : null}

          {!loading && activeMethod === "facebook_oauth" ? (
            <Button className="w-full" onClick={() => void verify()} disabled={verifying || requesting}>
              {t("continue_with_facebook")}
            </Button>
          ) : null}

          <HumanChallengeTurnstile challenge={captcha} keyPrefix="step-up-" />

          {!loading &&
          activeMethod &&
          activeMethod !== "passkey" &&
          activeMethod !== "wallet_reauth" &&
          activeMethod !== "facebook_oauth" ? (
            <div className="space-y-3">
              <Input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("code_placeholder")}
                className="font-mono"
                disabled={verifying}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void verify()} disabled={verifying || requesting}>
                  {verifying ? t("verifying") : t("verify")}
                </Button>
                {(activeMethod === "sms" || activeMethod === "otp_email") && (
                  <Button
                    variant="outline"
                    onClick={() => void requestStepUpFromUser(activeMethod)}
                    disabled={requesting || verifying}
                  >
                    {requesting ? t("sending") : t("resend")}
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {!loading && !availableMethods.length ? (
            <Button variant="outline" onClick={() => void loadAvailableMethods()} disabled={requesting}>
              {t("retry")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
