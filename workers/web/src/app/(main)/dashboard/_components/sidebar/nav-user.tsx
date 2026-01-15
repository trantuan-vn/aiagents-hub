"use client";

import { useState } from "react";

import Link from "next/link";

import { UserPen, CircleUser, CreditCard, MessageSquareDot, LogOut, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDisconnect, useAccount } from "wagmi";

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
        console.error("Logout failed");
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
        { title: t("account"), icon: CircleUser, url: "/account" },
        { title: t("billing"), icon: CreditCard, url: "/billing" },
        { title: t("notifications"), icon: MessageSquareDot, url: "/notifications" },
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
                    {menuItems.slice(0, -1).map((item, index) => (
                      <DropdownMenuItem key={`menu-${index}`}>
                        <Link href={item.url} className="flex w-full items-center">
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
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
