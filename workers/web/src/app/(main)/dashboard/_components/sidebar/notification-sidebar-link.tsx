"use client";

import Link from "next/link";

import { Bell } from "lucide-react";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { User } from "@/data/users";
import { useNotificationsStore } from "@/stores/notifications/notifications-store";
import { useNotificationsWs } from "@/stores/notifications/use-notifications-ws";

const NOTIFICATIONS_URL = "/dashboard/control/notifications";

/** Chuông báo số: link tới trang notifications, không mở dialog */
export function NotificationSidebarLink({
  isActive,
  isCollapsed,
  translateTitle,
  user,
}: {
  isActive: (url: string) => boolean;
  isCollapsed: boolean;
  translateTitle: (title: string) => string;
  user: User | null;
}) {
  useNotificationsWs(user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const title = translateTitle("Notifications");

  const badge =
    unreadCount > 0 ? (
      <span
        className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium shadow-sm"
        aria-hidden
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(NOTIFICATIONS_URL)} tooltip={title}>
        <Link href={NOTIFICATIONS_URL} className="relative">
          <Bell className="h-5 w-5" />
          {badge}
          {!isCollapsed && <span>{title}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
