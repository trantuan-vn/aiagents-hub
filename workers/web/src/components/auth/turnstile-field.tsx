"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
  ready?: (callback: () => void) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile="1"]');
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function isValidTurnstileSiteKey(siteKey: string | null | undefined): boolean {
  const key = (siteKey ?? "").trim();
  return /^0x4[A-Za-z0-9_-]{20,}$|^1x0[A-Za-z0-9_-]{20,}$/.test(key);
}

type TurnstileFieldProps = {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
};

export function TurnstileField({ siteKey, onToken, onExpire, onError }: TurnstileFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!isValidTurnstileSiteKey(siteKey)) {
      onErrorRef.current?.();
      return;
    }

    let cancelled = false;

    const mountWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;

      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget may already be gone */
        }
        widgetIdRef.current = null;
      }

      containerRef.current.replaceChildren();

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        "error-callback": () => onErrorRef.current?.(),
        theme: "auto",
        retry: "auto",
        "refresh-expired": "auto",
      });
    };

    void loadTurnstileScript()
      .then(() => {
        mountWidget();
      })
      .catch(() => onErrorRef.current?.());

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* ignore */
        }
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} className="flex min-h-[65px] justify-center" aria-label="Captcha" />;
}

export type CaptchaConfig = {
  enabled: boolean;
  siteKey: string | null;
  satisfied?: boolean;
  satisfiedPreauth?: boolean;
  satisfiedSession?: boolean;
};

export async function fetchCaptchaConfig(
  authApiUrl: string,
  options?: { scope?: "preauth" | "session" },
): Promise<CaptchaConfig> {
  try {
    const qs = options?.scope ? `?scope=${options.scope}` : "";
    const res = await fetch(`${authApiUrl}/captcha/config${qs}`, { credentials: "include" });
    if (!res.ok) return { enabled: false, siteKey: null };
    const data: {
      enabled?: boolean;
      siteKey?: string | null;
      satisfied?: boolean;
      satisfiedPreauth?: boolean;
      satisfiedSession?: boolean;
    } = await res.json();
    const siteKey = data.siteKey ?? null;
    const enabled = Boolean(data.enabled) && isValidTurnstileSiteKey(siteKey);
    return {
      enabled,
      siteKey: enabled ? siteKey : null,
      satisfied: Boolean(data.satisfied),
      satisfiedPreauth: Boolean(data.satisfiedPreauth),
      satisfiedSession: Boolean(data.satisfiedSession),
    };
  } catch {
    return { enabled: false, siteKey: null };
  }
}
