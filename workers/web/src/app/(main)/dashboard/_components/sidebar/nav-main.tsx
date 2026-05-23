"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlusCircleIcon, MailIcon, ChevronRight, Key, Tag, Code, Ticket, CreditCard, Banknote } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { User } from "@/data/users";
import { type NavGroup, type NavMainItem } from "@/navigation/sidebar/sidebar-items";

import { NavGroupSection } from "./nav-group-section";
import { getTranslateTitle } from "./sidebar-translations";

const QUICK_CREATE_ITEMS: {
  url: string;
  translationKey: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}[] = [
  { url: "/dashboard/control/token", translationKey: "quick_create_api_token", icon: Key },
  { url: "/dashboard/policy", translationKey: "quick_create_policy", icon: Tag, adminOnly: true },
  { url: "/dashboard/workflow/services", translationKey: "quick_create_service", icon: Code, adminOnly: true },
  { url: "/dashboard/voucher", translationKey: "quick_create_voucher", icon: Ticket, adminOnly: true },
  { url: "/dashboard/control/billing", translationKey: "quick_create_order", icon: CreditCard },
  { url: "/dashboard/commission-policy", translationKey: "quick_create_commission", icon: Banknote, adminOnly: true },
];

interface NavMainProps {
  readonly items: readonly NavGroup[];
  readonly user?: User | null;
}

export function NavMain({ items, user }: NavMainProps) {
  const t = useTranslations("Sidebar");
  const path = usePathname();
  const { state, isMobile } = useSidebar();
  const translateTitle = getTranslateTitle(t);
  const isAdmin = user?.role === "admin";
  const quickCreateItems = QUICK_CREATE_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (subItems?.length) {
      return subItems.some((sub) => path.startsWith(sub.url));
    }
    return path === url;
  };

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) => {
    return subItems?.some((sub) => path.startsWith(sub.url)) ?? false;
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip={t("quick_create")}
                    className="group bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-[state=open]:bg-primary/90 min-w-8 duration-200 ease-linear"
                  >
                    <PlusCircleIcon />
                    <span>{t("quick_create")}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]:rotate-90" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-56">
                  {quickCreateItems.map((item) => (
                    <DropdownMenuItem key={item.url} asChild>
                      <Link href={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{t(item.translationKey)}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 group-data-[collapsible=icon]:opacity-0"
                variant="outline"
                asChild
              >
                <a href="mailto:support@aiagents-hub.vn" title={t("email_admin")}>
                  <MailIcon />
                  <span className="sr-only">{t("email_admin")}</span>
                </a>
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.map((group) => (
        <NavGroupSection
          key={group.id}
          group={group}
          path={path}
          sidebarCollapsed={state === "collapsed"}
          isMobile={isMobile}
          isItemActive={isItemActive}
          isSubmenuOpen={isSubmenuOpen}
          t={t}
          translateTitle={translateTitle}
        />
      ))}
    </>
  );
}
