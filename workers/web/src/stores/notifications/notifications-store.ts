import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { NotificationItem, NotificationPayload } from "@/types/notifications";

export type NotificationsState = {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (payload: NotificationPayload) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  getNotification: (id: string) => NotificationItem | undefined;
};

function parsePayload(payload: NotificationPayload): NotificationItem {
  const id =
    "id" in payload && typeof payload.id === "string"
      ? payload.id
      : `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    createdAt: payload.createdAt ?? Date.now(),
    read: false,
  };
}

const MAX_NOTIFICATIONS = 100;

export const createNotificationsStore = (init?: { notifications?: NotificationItem[] }) =>
  createStore<NotificationsState>()((set, get) => ({
    notifications: init?.notifications ?? [],
    unreadCount: init?.notifications?.filter((n) => !n.read).length ?? 0,

    addNotification: (payload) => {
      const item = parsePayload(payload);
      set((state) => {
        const exists = state.notifications.some((n) => n.id === item.id);
        if (exists) return state;
        const list = [item, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
        return {
          notifications: list,
          unreadCount: state.unreadCount + 1,
        };
      });
    },

    markAsRead: (id) => {
      set((state) => {
        const list = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
        const unreadCount = list.filter((n) => !n.read).length;
        return { notifications: list, unreadCount };
      });
    },

    markAllAsRead: () => {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    },

    getNotification: (id) => get().notifications.find((n) => n.id === id),
  }));

const notificationsStore = createNotificationsStore();

export { notificationsStore };

export function useNotificationsStore<T>(selector: (state: NotificationsState) => T): T {
  return useStore(notificationsStore, selector);
}
