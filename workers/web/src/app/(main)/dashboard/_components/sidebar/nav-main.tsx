"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlusCircleIcon, MailIcon, ChevronRight, Key, Tag, Code, Ticket, CreditCard, Banknote } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { User } from "@/data/users";
import { type NavGroup, type NavMainItem } from "@/navigation/sidebar/sidebar-items";

import { getTranslateTitle } from "./sidebar-translations";

const HIDDEN_NAV_URLS = ["/dashboard/control/notifications", "/dashboard/control/settings"];

const QUICK_CREATE_ITEMS: {
  url: string;
  translationKey: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}[] = [
  { url: "/dashboard/control/token", translationKey: "quick_create_api_token", icon: Key },
  { url: "/dashboard/policy", translationKey: "quick_create_policy", icon: Tag, adminOnly: true },
  { url: "/dashboard/service", translationKey: "quick_create_service", icon: Code, adminOnly: true },
  { url: "/dashboard/voucher", translationKey: "quick_create_voucher", icon: Ticket, adminOnly: true },
  { url: "/dashboard/control/billing", translationKey: "quick_create_order", icon: CreditCard },
  { url: "/dashboard/commission-policy", translationKey: "quick_create_commission", icon: Banknote, adminOnly: true },
];

interface NavMainProps {
  readonly items: readonly NavGroup[];
  readonly user?: User | null;
}

const IsComingSoon = ({ t }: { t: (key: string) => string }) => (
  <span className="ml-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">{t("coming_soon")}</span>
);

const NavItemExpanded = ({
  item,
  isActive,
  isSubmenuOpen,
  t,
  translateTitle,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
  t: (key: string) => string;
  translateTitle: (title: string) => string;
}) => {
  return (
    <Collapsible asChild defaultOpen={isSubmenuOpen(item.subItems)} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {item.subItems ? (
            <SidebarMenuButton
              disabled={item.comingSoon}
              isActive={isActive(item.url, item.subItems)}
              tooltip={item.title}
            >
              {item.icon && <item.icon />}
              <span>{translateTitle(item.title)}</span>
              {item.comingSoon && <IsComingSoon t={t} />}
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              asChild
              aria-disabled={item.comingSoon}
              isActive={isActive(item.url)}
              tooltip={item.title}
            >
              <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
                {item.icon && <item.icon />}
                <span>{translateTitle(item.title)}</span>
                {item.comingSoon && <IsComingSoon t={t} />}
              </Link>
            </SidebarMenuButton>
          )}
        </CollapsibleTrigger>
        {item.subItems && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.subItems.map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton aria-disabled={subItem.comingSoon} isActive={isActive(subItem.url)} asChild>
                    <Link href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                      {subItem.icon && <subItem.icon />}
                      <span>{translateTitle(subItem.title)}</span>
                      {subItem.comingSoon && <IsComingSoon t={t} />}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
};

const NavItemCollapsed = ({
  item,
  isActive,
  t,
  translateTitle,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  t: (key: string) => string;
  translateTitle: (title: string) => string;
}) => {
  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={item.title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon />}
            <span>{translateTitle(item.title)}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
          {item.subItems?.map((subItem) => (
            <DropdownMenuItem key={subItem.title} asChild>
              <SidebarMenuSubButton
                asChild
                className="focus-visible:ring-0"
                aria-disabled={subItem.comingSoon}
                isActive={isActive(subItem.url)}
              >
                <Link href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                  {subItem.icon && <subItem.icon className="[&>svg]:text-sidebar-foreground" />}
                  <span>{translateTitle(subItem.title)}</span>
                  {subItem.comingSoon && <IsComingSoon t={t} />}
                </Link>
              </SidebarMenuSubButton>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

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
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{translateTitle(group.label)}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                if (HIDDEN_NAV_URLS.includes(item.url)) {
                  return null;
                }
                if (state === "collapsed" && !isMobile) {
                  // If no subItems, just render the button as a link
                  if (!item.subItems) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          aria-disabled={item.comingSoon}
                          tooltip={item.title}
                          isActive={isItemActive(item.url)}
                        >
                          <Link href={item.url} target={item.newTab ? "_blank" : undefined}>
                            {item.icon && <item.icon />}
                            <span>{translateTitle(item.title)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  // Otherwise, render the dropdown as before
                  return (
                    <NavItemCollapsed
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      t={t}
                      translateTitle={translateTitle}
                    />
                  );
                }
                // Expanded view
                return (
                  <NavItemExpanded
                    key={item.title}
                    item={item}
                    isActive={isItemActive}
                    isSubmenuOpen={isSubmenuOpen}
                    t={t}
                    translateTitle={translateTitle}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
