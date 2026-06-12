"use client";

import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { type NavMainItem } from "@/navigation/sidebar/sidebar-items";

export const HIDDEN_NAV_URLS = ["/dashboard/control/notifications", "/dashboard/control/settings"];

const IsComingSoon = ({ t }: { t: (key: string) => string }) => (
  <span className="ml-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">{t("coming_soon")}</span>
);

export const NavItemExpanded = ({
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
  if (!item.subItems?.length) {
    return (
      <SidebarMenuItem>
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
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild defaultOpen={isSubmenuOpen(item.subItems)} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
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
        </CollapsibleTrigger>
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
      </SidebarMenuItem>
    </Collapsible>
  );
};

export const NavItemCollapsed = ({
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
