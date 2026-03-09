"use client";

import { useState } from "react";

import Link from "next/link";

import { Bell, CircleUser, CreditCard, LogIn, LogOut, UserPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDisconnect, useAccount } from "wagmi";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { User } from "@/data/users";

export function NavUser({ user }: { readonly user: User | null }) {
  const t = useTranslations("AccountSwitcher");
  const { isMobile } = useSidebar();
  const { disconnect } = useDisconnect();
  const { isConnected } = useAccount();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      // Server sẽ đóng WebSocket khi logout API trả về; client nhận onclose và không reconnect (use-ws xử lý)
      // Disconnect wallet
      disconnect();

      // Wait for wallet disconnection or timeout
      let attempts = 0;
      const maxAttempts = 10; // 2 seconds total (200ms * 10)

      const checkDisconnected = () => {
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            attempts++;
            if (!isConnected || attempts >= maxAttempts) {
              clearInterval(interval);
              resolve(true);
            }
          }, 200);
        });
      };

      await checkDisconnected();

      // Call API logout
      const response = await fetch("https://api.unitoken.trade/dashboard/auth/profile/logout", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        window.location.href = "/"; // Redirect to login page
      } else {
        // Session có thể đã hết hạn (401) - vẫn redirect để clear state và quay về trang đăng nhập
        window.location.href = "/";
      }
    } catch (error) {
      console.error("Error during logout:", error);
      window.location.href = "/";
    } finally {
      setIsLoggingOut(false);
    }
  };

  const menuItems = user
    ? [
        { title: t("account"), icon: CircleUser, url: "/dashboard/control/account" },
        { title: t("billing"), icon: CreditCard, url: "/dashboard/control/billing" },
        {
          title: t("notifications"),
          icon: Bell,
          url: "/dashboard/control/notifications",
          isNotifications: true,
        },
        { title: t("log_out"), icon: LogOut, url: "#", onClick: isLoggingOut ? undefined : handleLogout },
      ]
    : [{ title: t("log_in"), icon: LogIn, url: "/login" }];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex w-full items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" disabled={isLoggingOut}>
                <UserPen />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 space-y-1 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              {user ? (
                <>
                  <DropdownMenuGroup>
                    {menuItems.slice(0, -1).map((item) =>
                      "isNotifications" in item && item.isNotifications ? (
                        <DropdownMenuItem
                          key={item.title}
                          onSelect={(e) => e.preventDefault()}
                          className="cursor-pointer"
                        >
                          <NotificationBell
                            user={user}
                            size="sm"
                            renderTrigger={({ unreadCount }) => (
                              <span className="flex w-full items-center">
                                <Bell className="mr-2 h-4 w-4" />
                                {unreadCount > 0 && (
                                  <span className="bg-destructive text-destructive-foreground mr-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                  </span>
                                )}
                                <span>{item.title}</span>
                              </span>
                            )}
                          />
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem key={item.title}>
                          <Link href={item.url} className="flex w-full items-center">
                            <item.icon className="mr-2 h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </DropdownMenuItem>
                      ),
                    )}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={isLoggingOut}>
                    <button
                      onClick={menuItems[menuItems.length - 1].onClick}
                      className="flex w-full items-center"
                      disabled={isLoggingOut}
                    >
                      {(() => {
                        const Icon = menuItems[menuItems.length - 1].icon;
                        return <Icon className="mr-2 h-4 w-4" />;
                      })()}
                      <span>{isLoggingOut ? t("logging_out") : menuItems[menuItems.length - 1].title}</span>
                    </button>
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem>
                  <Link href={menuItems[0].url} className="flex w-full items-center">
                    {(() => {
                      const Icon = menuItems[0].icon;
                      return <Icon className="mr-2 h-4 w-4" />;
                    })()}
                    <span>{menuItems[0].title}</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {user && (
            <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-medium">{user.identifier}</div>
              <div className="text-muted-foreground text-xs capitalize">{user.role ?? "member"}</div>
            </div>
          )}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
