"use client";

import { useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotificationsStore } from "@/stores/notifications/notifications-store";
import { useNotificationsWs } from "@/stores/notifications/use-notifications-ws";
import type { NotificationItem } from "@/types/notifications";

function NotificationDetailDialog({
  notification,
  open,
  onOpenChange,
}: {
  notification: NotificationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const markAsRead = useNotificationsStore((s) => s.markAsRead);

  if (!notification) return null;

  const handleOpenChange = (next: boolean) => {
    if (!next) markAsRead(notification.id);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8">{notification.title}</DialogTitle>
        </DialogHeader>
        <div className="text-muted-foreground text-sm">{notification.body ?? ""}</div>
        {notification.data && Object.keys(notification.data).length > 0 && (
          <pre className="border-border bg-muted text-muted-foreground mt-2 max-h-40 overflow-auto rounded-md border p-2 text-xs">
            {JSON.stringify(notification.data, null, 2)}
          </pre>
        )}
        <div className="text-muted-foreground text-xs">
          {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotificationDropdownContent({
  notifications,
  onItemClick,
  onMarkAllRead,
  t,
}: {
  notifications: NotificationItem[];
  onItemClick: (id: string) => void;
  onMarkAllRead: () => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <span className="text-foreground font-medium">{t("title")}</span>
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-7 text-xs"
            onClick={onMarkAllRead}
          >
            {t("mark_all_read")}
          </Button>
        )}
      </div>
      <ScrollArea className="h-[280px]">
        {notifications.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</div>
        ) : (
          <ul className="py-1">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-accent hover:text-accent-foreground w-full px-3 py-2.5 text-left text-sm transition-colors",
                    !n.read ? "text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => onItemClick(n.id)}
                >
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.body}</div>}
                  <div className="text-muted-foreground mt-1 text-xs">
                    {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </>
  );
}

function DefaultBellTrigger({
  unreadCount,
  isSm,
  className,
  variant,
  sidebarLabel,
  t,
}: {
  unreadCount: number;
  isSm: boolean;
  className: string;
  variant: string;
  sidebarLabel?: string;
  t: (key: string) => string;
}) {
  const badgeEl =
    unreadCount > 0 ? (
      <span
        className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium shadow-sm"
        aria-hidden
      >
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;
  return (
    <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label={t("aria_label")}>
      <Bell className={isSm ? "h-4 w-4" : "h-5 w-5"} />
      {badgeEl}
      {variant === "icon-with-label" && <span className="ml-2 hidden sm:inline">{t("label")}</span>}
      {variant === "sidebar" && sidebarLabel && (
        <span className="group-data-[collapsible=icon]:hidden">{sidebarLabel}</span>
      )}
    </Button>
  );
}

export interface NotificationBellProps {
  /** User for WebSocket connection; if null, badge/list still work from store but no live updates */
  user?: { identifier: string } | null;
  /** Render as icon-only button (sidebar/header) or with label */
  variant?: "icon" | "icon-with-label" | "sidebar";
  /** Class for the trigger button */
  className?: string;
  /** Sidebar: use smaller icon and badge */
  size?: "default" | "sm";
  /** Custom label for sidebar variant (e.g. translated "Notifications") */
  sidebarLabel?: string;
  /** Custom trigger element (e.g. SidebarMenuButton); receives unreadCount for badge */
  renderTrigger?: (props: { unreadCount: number }) => React.ReactNode;
}

export function NotificationBell({
  user = null,
  variant = "icon",
  className,
  size = "default",
  sidebarLabel,
  renderTrigger,
}: NotificationBellProps) {
  const t = useTranslations("Notifications");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useNotificationsWs(user ?? null);

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
  const getNotification = useNotificationsStore((s) => s.getNotification);

  const selectedNotification = detailId ? getNotification(detailId) : null;
  const isSm = size === "sm";

  const handleItemClick = (id: string) => {
    setDetailId(id);
    setDropdownOpen(false);
  };

  const defaultTrigger = (
    <DefaultBellTrigger
      unreadCount={unreadCount}
      isSm={isSm}
      className={className ?? ""}
      variant={variant}
      sidebarLabel={sidebarLabel}
      t={t}
    />
  );
  const trigger = renderTrigger ? renderTrigger({ unreadCount }) : defaultTrigger;

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="border-border w-80 p-0"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <NotificationDropdownContent
            notifications={notifications}
            onItemClick={handleItemClick}
            onMarkAllRead={markAllAsRead}
            t={t}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <NotificationDetailDialog
        notification={selectedNotification ?? null}
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
    </>
  );
}
