"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchCaptchaConfig,
  isValidTurnstileSiteKey,
  TurnstileField,
  type CaptchaConfig,
} from "@/components/auth/turnstile-field";
import type { AuthApiErrorBody } from "@/lib/auth-api-error";

export type HumanChallengeScope = "preauth" | "session" | "support";

function scopeSatisfied(cfg: CaptchaConfig, scope: HumanChallengeScope): boolean {
  if (scope === "session") return Boolean(cfg.satisfiedSession ?? cfg.satisfied);
  if (scope === "support") return Boolean(cfg.satisfied);
  return Boolean(cfg.satisfiedPreauth ?? cfg.satisfied);
}

export type UseHumanChallengeOptions = {
  authApiUrl: string;
  scope: HumanChallengeScope;
  sessionId?: string;
  envFallbackSiteKey?: string | null;
  /** Show the widget as soon as Turnstile is on and this scope is not satisfied. */
  revealWhenUnsatisfied?: boolean;
  /** Hide the solved widget immediately. The token stays available for the next request. */
  hideWhenSolved?: boolean;
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
  sessionId,
  envFallbackSiteKey = null,
  revealWhenUnsatisfied = false,
  hideWhenSolved = false,
  onCaptchaLoadError,
}: UseHumanChallengeOptions): HumanChallengeHandle {
  const envFallback = isValidTurnstileSiteKey(envFallbackSiteKey) ? envFallbackSiteKey : null;
  const onCaptchaLoadErrorRef = useRef(onCaptchaLoadError);
  onCaptchaLoadErrorRef.current = onCaptchaLoadError;
  const tokenRef = useRef("");

  const [configLoaded, setConfigLoaded] = useState(false);
  const [turnstileConfigured, setTurnstileConfigured] = useState(false);
  const [satisfied, setSatisfied] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(envFallback);
  const [token, setToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);

  const refreshConfig = useCallback(async () => {
    const cfg = await fetchCaptchaConfig(authApiUrl, {
      scope,
      sessionId: scope === "support" ? sessionId : undefined,
    });
    const key = cfg.siteKey ?? envFallback;
    const configured = cfg.unreachable
      ? Boolean(revealWhenUnsatisfied && isValidTurnstileSiteKey(key))
      : cfg.enabled && isValidTurnstileSiteKey(key);
    const sat = configured && scopeSatisfied(cfg, scope);

    setTurnstileConfigured(configured);
    setSiteKey(key);
    setSatisfied(sat);
    if (sat) setShowWidget(false);
    else if (revealWhenUnsatisfied && configured && !tokenRef.current) setShowWidget(true);
    setConfigLoaded(true);
  }, [authApiUrl, envFallback, revealWhenUnsatisfied, scope, sessionId]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const resetWidget = useCallback(() => {
    tokenRef.current = "";
    setToken("");
    setWidgetKey((k) => k + 1);
  }, []);

  const onToken = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      tokenRef.current = trimmed;
      setToken(trimmed);
      if (trimmed && hideWhenSolved) setShowWidget(false);
    },
    [hideWhenSolved],
  );

  const handleCaptchaError = useCallback(() => {
    resetWidget();
    onCaptchaLoadErrorRef.current?.();
  }, [resetWidget]);

  const applyCaptchaError = useCallback(
    (body: AuthApiErrorBody | null | undefined) => {
      if (!body?.requiresCaptcha) return;
      setSatisfied(false);
      setShowWidget(true);
      const key = body.siteKey;
      if (typeof key === "string" && isValidTurnstileSiteKey(key)) {
        setSiteKey(key);
        setTurnstileConfigured(true);
      }
      resetWidget();
    },
    [resetWidget],
  );

  const onRequestSuccess = useCallback(async () => {
    tokenRef.current = "";
    setToken("");
    setSatisfied(true);
    setShowWidget(false);
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
    onToken,
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
  action?: string;
};

export function HumanChallengeTurnstile({ challenge, keyPrefix = "", action }: HumanChallengeTurnstileProps) {
  if (!challenge.showTurnstileField || !challenge.siteKey) return null;
  return (
    <TurnstileField
      key={`${keyPrefix}${challenge.widgetKey}`}
      siteKey={challenge.siteKey}
      action={action}
      onToken={challenge.onToken}
      onExpire={challenge.resetWidget}
      onError={challenge.handleCaptchaError}
    />
  );
}
