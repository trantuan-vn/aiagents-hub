"use client";

import { useWs } from "@/core/use-ws";

import { notificationsStore } from "./notifications-store";

type NotificationPayload = {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

function parseNotificationPayload(data: unknown): NotificationPayload | null {
  if (typeof data === "string") {
    return { title: "Thông báo", body: data };
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const payload = data as { title?: string; body?: string; message?: string; data?: Record<string, unknown> };
    return {
      title: payload.title ?? "Thông báo",
      body: payload.body ?? payload.message,
      data: payload.data,
    };
  }
  return null;
}

const notificationsWsHandlers = {
  broadcast(data: unknown) {
    if (data === undefined || data === null) return;
    if (typeof data === "object") {
      const d = (data as { data?: { channel?: string } }).data;
      if (d?.channel === "ask-ai") return;
    }
    const payload = parseNotificationPayload(data);
    if (!payload) return;
    notificationsStore.getState().addNotification({
      title: payload.title,
      body: payload.body,
      data: payload.data,
    });
  },
};

/**
 * Hook đăng ký nhận thông báo qua WebSocket (dùng core useWs với event=broadcast).
 * Singleton: nhiều component gọi với cùng user chỉ tạo một kết nối.
 */
export function useNotificationsWs(user: { identifier: string } | null) {
  useWs(user, notificationsWsHandlers);
}
