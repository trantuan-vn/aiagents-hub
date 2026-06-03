"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchCaptchaConfig,
  isValidTurnstileSiteKey,
  TurnstileField,
  type CaptchaConfig,
} from "@/components/auth/turnstile-field";
import type { AuthApiErrorBody } from "@/lib/auth-api-error";

export type HumanChallengeScope = "preauth" | "session";

function scopeSatisfied(cfg: CaptchaConfig, scope: HumanChallengeScope): boolean {
  if (scope === "session") return Boolean(cfg.satisfiedSession ?? cfg.satisfied);
  return Boolean(cfg.satisfiedPreauth ?? cfg.satisfied);
}

export type UseHumanChallengeOptions = {
  authApiUrl: string;
  scope: HumanChallengeScope;
  envFallbackSiteKey?: string | null;
  onCaptchaLoadError?: () => void;
};

export type HumanChallengeHandle = {
  configLoaded: boolean;
  turnstileConfigured: boolean;
  satisfied: boolean;
  showTurnstileField: boolean;
  siteKey: string | null;
  widgetKey: number;
  needsTokenBeforeSubmit: boolean;
  onToken: (token: string) => void;
  resetWidget: () => void;
  handleCaptchaError: () => void;
  applyCaptchaError: (body: AuthApiErrorBody | null | undefined) => void;
  onRequestSuccess: () => Promise<void>;
  turnstileTokenForBody: () => string | undefined;
  refreshConfig: () => Promise<void>;
};

export function useHumanChallenge({
  authApiUrl,
  scope,
  envFallbackSiteKey = null,
  onCaptchaLoadError,
}: UseHumanChallengeOptions): HumanChallengeHandle {
  const envFallback = isValidTurnstileSiteKey(envFallbackSiteKey) ? envFallbackSiteKey : null;
  const onCaptchaLoadErrorRef = useRef(onCaptchaLoadError);
  onCaptchaLoadErrorRef.current = onCaptchaLoadError;

  const [configLoaded, setConfigLoaded] = useState(false);
  const [turnstileConfigured, setTurnstileConfigured] = useState(false);
  const [satisfied, setSatisfied] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(envFallback);
  const [token, setToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);

  const refreshConfig = useCallback(async () => {
    const cfg = await fetchCaptchaConfig(authApiUrl, { scope });
    const key = cfg.siteKey ?? envFallback;
    const configured = cfg.enabled && isValidTurnstileSiteKey(key);
    const sat = configured && scopeSatisfied(cfg, scope);

    setTurnstileConfigured(configured);
    setSiteKey(key);
    setSatisfied(sat);
    if (sat) setShowWidget(false);
    setConfigLoaded(true);
  }, [authApiUrl, envFallback, scope]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const resetWidget = useCallback(() => {
    setToken("");
    setWidgetKey((k) => k + 1);
  }, []);

  const handleCaptchaError = useCallback(() => {
    resetWidget();
    onCaptchaLoadErrorRef.current?.();
  }, [resetWidget]);

  const applyCaptchaError = useCallback(
    (body: AuthApiErrorBody | null | undefined) => {
      if (!body?.requiresCaptcha) return;
      setShowWidget(true);
      const key = body.siteKey;
      if (typeof key === "string" && isValidTurnstileSiteKey(key)) {
        setSiteKey(key);
      }
      resetWidget();
    },
    [resetWidget],
  );

  const onRequestSuccess = useCallback(async () => {
    setToken("");
    await refreshConfig();
  }, [refreshConfig]);

  const turnstileTokenForBody = useCallback((): string | undefined => {
    const trimmed = token.trim();
    return trimmed || undefined;
  }, [token]);

  const showTurnstileField = turnstileConfigured && showWidget && Boolean(siteKey) && !satisfied;
  const needsTokenBeforeSubmit = showWidget && !satisfied && !token.trim();

  return {
    configLoaded,
    turnstileConfigured,
    satisfied,
    showTurnstileField,
    siteKey,
    widgetKey,
    needsTokenBeforeSubmit,
    onToken: setToken,
    resetWidget,
    handleCaptchaError,
    applyCaptchaError,
    onRequestSuccess,
    turnstileTokenForBody,
    refreshConfig,
  };
}

type HumanChallengeTurnstileProps = {
  challenge: HumanChallengeHandle;
  keyPrefix?: string;
};

export function HumanChallengeTurnstile({ challenge, keyPrefix = "" }: HumanChallengeTurnstileProps) {
  if (!challenge.showTurnstileField || !challenge.siteKey) return null;
  return (
    <TurnstileField
      key={`${keyPrefix}${challenge.widgetKey}`}
      siteKey={challenge.siteKey}
      onToken={challenge.onToken}
      onExpire={challenge.resetWidget}
      onError={challenge.handleCaptchaError}
    />
  );
}
