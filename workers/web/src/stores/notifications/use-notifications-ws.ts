"use client";

import { useEffect } from "react";

import { notificationsStore } from "./notifications-store";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

function getNotificationsWsUrl(): string {
  if (typeof window === "undefined") return "";
  const base = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.unitoken.trade";
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/dashboard/ws/connect";
  return url.toString();
}

/** Singleton: một kết nối WebSocket duy nhất cho toàn app, ref-count theo số component đang dùng */
function createConnectionManager() {
  let ws: WebSocket | null = null;
  let subscriberCount = 0;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  /** Ref để tránh stale closure: không reconnect nếu user đã logout */
  let currentIdentifier: string | null = null;

  function disconnect(): void {
    if (reconnectTimeoutId != null) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    if (ws != null) {
      try {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
    currentIdentifier = null;
    reconnectAttempts = 0;
  }

  function connect(identifier: string): void {
    const wsUrl = getNotificationsWsUrl();
    if (!wsUrl || ws?.readyState === WebSocket.OPEN) return;

    try {
      const socket = new WebSocket(wsUrl);
      ws = socket;
      currentIdentifier = identifier;

      socket.onopen = () => {
        reconnectAttempts = 0;
        try {
          socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          // ignore
        }
      };

      socket.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data as string) as {
            event?: string;
            data?: unknown;
            type?: string;
          };
          const eventName = raw.event ?? raw.type;
          const data = raw.data;
          if (eventName === "heartbeat") return;
          if (eventName === "broadcast" && data !== undefined && data !== null) {
            let title: string;
            let body: string | undefined;
            if (typeof data === "string") {
              title = "Thông báo";
              body = data;
            } else if (typeof data === "object" && !Array.isArray(data)) {
              const payload = data as {
                title?: string;
                body?: string;
                message?: string;
                id?: string;
                createdAt?: number;
              };
              title = payload.title ?? "Thông báo";
              body = payload.body ?? payload.message;
            } else {
              return;
            }
            notificationsStore.getState().addNotification({
              title,
              body,
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      socket.onclose = () => {
        ws = null;
        if (currentIdentifier === null) return;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
          const jitter = Math.random() * 0.3 * delay;
          reconnectAttempts += 1;
          reconnectTimeoutId = setTimeout(() => {
            reconnectTimeoutId = null;
            if (currentIdentifier !== null) connect(currentIdentifier);
          }, delay + jitter);
        }
      };

      socket.onerror = () => {
        // onclose sẽ được gọi, reconnect ở đó
      };
    } catch {
      ws = null;
      if (currentIdentifier != null && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
        const jitter = Math.random() * 0.3 * delay;
        reconnectAttempts += 1;
        reconnectTimeoutId = setTimeout(() => {
          reconnectTimeoutId = null;
          if (currentIdentifier !== null) connect(currentIdentifier);
        }, delay + jitter);
      }
    }
  }

  function subscribe(identifier: string): () => void {
    subscriberCount += 1;
    if (subscriberCount === 1) {
      connect(identifier);
    }
    return () => {
      subscriberCount -= 1;
      if (subscriberCount <= 0) {
        subscriberCount = 0;
        currentIdentifier = null;
        disconnect();
      }
    };
  }

  return { subscribe };
}

const manager = createConnectionManager();

/**
 * Hook đăng ký nhận thông báo qua WebSocket.
 * Dùng singleton: nhiều component gọi với cùng user chỉ tạo một kết nối.
 */
export function useNotificationsWs(user: { identifier: string } | null) {
  useEffect(() => {
    if (!user?.identifier) return undefined;
    return manager.subscribe(user.identifier);
  }, [user?.identifier]);
}
