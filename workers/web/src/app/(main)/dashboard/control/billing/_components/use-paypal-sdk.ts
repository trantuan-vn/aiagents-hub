"use client";

import { useEffect, useState } from "react";

type PaypalSdkStatus = "disabled" | "loading" | "ready" | "error";

const SDK_SCRIPT_ID = "paypal-sdk";

let sdkPromise: Promise<void> | null = null;
let loadedClientId: string | null = null;

function loadPaypalSdk(clientId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.paypal && loadedClientId === clientId) return Promise.resolve();
  if (sdkPromise && loadedClientId === clientId) return sdkPromise;

  loadedClientId = clientId;
  sdkPromise = new Promise<void>((resolve, reject) => {
    // Remove a stale script (e.g. different client id) before injecting a new one.
    document.getElementById(SDK_SCRIPT_ID)?.remove();
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    const params = new URLSearchParams({
      "client-id": clientId,
      currency: "USD",
      intent: "capture",
      components: "buttons",
      // Only show the PayPal button (hide the standalone Debit/Credit card + Pay Later buttons).
      "disable-funding": "card,paylater",
    });
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      loadedClientId = null;
      reject(new Error("PayPal SDK failed to load"));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

/** Loads the PayPal JS SDK for the given client id and reports its readiness. */
export function usePaypalSdk(enabled: boolean, clientId: string): PaypalSdkStatus {
  const [status, setStatus] = useState<PaypalSdkStatus>(clientId ? "loading" : "disabled");

  useEffect(() => {
    if (!enabled) return;
    if (!clientId) {
      setStatus("disabled");
      return;
    }
    let active = true;
    setStatus(window.paypal && loadedClientId === clientId ? "ready" : "loading");
    loadPaypalSdk(clientId)
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [enabled, clientId]);

  return status;
}
