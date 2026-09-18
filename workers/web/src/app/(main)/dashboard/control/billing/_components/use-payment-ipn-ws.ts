"use client";

import { useMemo, useRef } from "react";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { useWs } from "@/core/use-ws";

import { parsePaymentIpnBroadcast } from "./payment-ipn";

type UsePaymentIpnWsOptions = {
  enabled: boolean;
  orderId: number;
  onSuccess: () => void;
};

/**
 * Listen on the shared notifications WebSocket (`event=broadcast`) for Casso/VNPay IPN.
 * Does not open a second connection — the dashboard notification hook already holds the socket.
 */
export function usePaymentIpnWs({ enabled, orderId, onSuccess }: UsePaymentIpnWsOptions): void {
  const user = useDashboardUser();
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;

  const handlers = useMemo(
    () => ({
      broadcast: (data: unknown) => {
        if (!enabledRef.current) return;
        const event = parsePaymentIpnBroadcast(data);
        if (!event || event.status !== "success") return;
        if (event.orderId !== orderIdRef.current) return;
        onSuccessRef.current();
      },
    }),
    [],
  );

  useWs(enabled && user?.identifier ? user : null, handlers);
}
