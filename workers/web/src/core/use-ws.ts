"use client";

import { useEffect } from "react";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export type WsMessageHandler = (data: unknown) => void;
/** Event name -> handler. Indexing may return undefined nếu event không có handler. */
export type WsMessageHandlers = Partial<Record<string, WsMessageHandler>>;

export type UseWsOptions = {
  /** URL của WebSocket. Mặc định dùng NEXT_PUBLIC_AUTH_API_URL + /dashboard/ws/connect */
  getUrl?: () => string;
};

function getDefaultWsUrl(): string {
  if (typeof window === "undefined") return "";
  const base = process.env.NEXT_PUBLIC_AUTH_API_URL ?? "https://api.aiagents-hub.vn";
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/dashboard/ws/connect";
  return url.toString();
}

type RawMessage = { event?: string; type?: string; data?: unknown };

/**
 * Singleton: một kết nối WebSocket duy nhất cho toàn app.
 * Hỗ trợ nhiều handler theo event (heartbeat, broadcast, hoặc event tùy chỉnh sau này).
 * Mỗi feature (notifications, orders, ...) đăng ký handlers tương ứng qua useWs(user, handlers).
 */
function createConnectionManager(options: UseWsOptions = {}) {
  const getUrl = options.getUrl ?? getDefaultWsUrl;

  let ws: WebSocket | null = null;
  let subscriberCount = 0;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let currentIdentifier: string | null = null;

  /**
   * event -> (handler -> refCount).
   * Nhiều component có thể subscribe cùng handler; chỉ remove khi refCount về 0.
   * Tránh bug: component A unmount xóa handler khi component B vẫn cần.
   */
  const handlerRefCountByEvent = new Map<string, Map<WsMessageHandler, number>>();
  const subscriptionEntries: Array<{ handlers: WsMessageHandlers }> = [];

  function getHandlersForEvent(eventName: string): WsMessageHandler[] {
    const refCountMap = handlerRefCountByEvent.get(eventName);
    if (!refCountMap) return [];
    return Array.from(refCountMap.keys());
  }

  function dispatchMessage(raw: RawMessage): void {
    const eventName = raw.event ?? raw.type;
    if (eventName === "heartbeat") return;

    const data = raw.data;
    const handlers = getHandlersForEvent(eventName ?? "");
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[useWs] handler for event "${eventName}" threw:`, err);
      }
    }
  }

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
    const wsUrl = getUrl();
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
          const raw = JSON.parse(event.data as string) as RawMessage;
          dispatchMessage(raw);
        } catch {
          // ignore parse errors
        }
      };

      socket.onclose = (event: CloseEvent) => {
        ws = null;
        // Server đóng WS khi logout (code 1000, reason "Session logged out" hoặc "All sessions logged out") → không reconnect
        const reason = event.reason;
        const isServerLogout = event.code === 1000 && (reason ? reason.includes("logged out") : false);
        if (isServerLogout) {
          currentIdentifier = null;
          reconnectAttempts = 0;
          return;
        }
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

  function subscribe(identifier: string, handlers: WsMessageHandlers): () => void {
    const entry = { handlers };
    for (const [event, fn] of Object.entries(handlers)) {
      if (fn) {
        let refCountMap = handlerRefCountByEvent.get(event);
        if (!refCountMap) {
          refCountMap = new Map();
          handlerRefCountByEvent.set(event, refCountMap);
        }
        const count = (refCountMap.get(fn) ?? 0) + 1;
        refCountMap.set(fn, count);
      }
    }
    subscriptionEntries.push(entry);

    subscriberCount += 1;
    if (subscriberCount === 1) {
      connect(identifier);
    }

    return () => {
      subscriberCount -= 1;
      for (const [event, fn] of Object.entries(entry.handlers)) {
        if (fn) {
          const refCountMap = handlerRefCountByEvent.get(event);
          if (refCountMap) {
            const count = (refCountMap.get(fn) ?? 1) - 1;
            if (count <= 0) refCountMap.delete(fn);
            else refCountMap.set(fn, count);
          }
        }
      }
      const idx = subscriptionEntries.indexOf(entry);
      if (idx !== -1) subscriptionEntries.splice(idx, 1);
      if (subscriberCount <= 0) {
        subscriberCount = 0;
        currentIdentifier = null;
        disconnect();
      }
    };
  }

  return { subscribe, disconnect };
}

const defaultManager = createConnectionManager();

/** Ngắt kết nối WebSocket chủ động. Dùng khi logout để đảm bảo không còn kết nối với server. */
export function disconnectWs(): void {
  defaultManager.disconnect();
}

/**
 * Hook core WebSocket: một kết nối dùng chung, dispatch message theo event.
 * - event=heartbeat: bỏ qua (no-op).
 * - event=broadcast, event=...: gọi handler tương ứng trong `handlers`.
 *
 * Ví dụ:
 *   useWs(user, { broadcast: (data) => notificationsStore.getState().addNotification(...) })
 * Sau này thêm event khác:
 *   useWs(user, { order_updated: (data) => ordersStore.getState().updateOrder(...) })
 *
 * @param user - { identifier: string } | null. Chỉ connect khi user có identifier.
 * @param handlers - map event -> (data) => void. Nên giữ reference ổn định (ví dụ định nghĩa ngoài component hoặc useMemo).
 */
export function useWs(user: { identifier: string } | null, handlers: WsMessageHandlers) {
  useEffect(() => {
    if (!user?.identifier) return undefined;
    return defaultManager.subscribe(user.identifier, handlers);
  }, [user?.identifier, handlers]);
}

export { createConnectionManager };
