"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { type NavGroup, type NavMainItem } from "@/navigation/sidebar/sidebar-items";

import { HIDDEN_NAV_URLS, NavItemCollapsed, NavItemExpanded } from "./nav-menu-items";

const GROUP_LABEL_CLASS =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 cursor-pointer px-2 text-sm font-semibold tracking-wide select-none [&>svg]:size-4";

function isGroupActive(group: NavGroup, path: string) {
  return group.items.some((item) => path === item.url || path.startsWith(`${item.url}/`));
}

export interface NavGroupSectionProps {
  group: NavGroup;
  path: string;
  sidebarCollapsed: boolean;
  isMobile: boolean;
  isItemActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
  t: (key: string) => string;
  translateTitle: (title: string) => string;
}

export function NavGroupSection({
  group,
  path,
  sidebarCollapsed,
  isMobile,
  isItemActive,
  isSubmenuOpen,
  t,
  translateTitle,
}: NavGroupSectionProps) {
  const [open, setOpen] = useState(() => isGroupActive(group, path));
  const showCollapsible = !sidebarCollapsed || isMobile;

  useEffect(() => {
    if (isGroupActive(group, path)) {
      setOpen(true);
    }
  }, [path, group]);

  const menuItems = (
    <SidebarMenu>
      {group.items.map((item) => {
        if (HIDDEN_NAV_URLS.includes(item.url)) {
          return null;
        }
        if (sidebarCollapsed && !isMobile) {
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
  );

  if (!group.label) {
    return (
      <SidebarGroup key={group.id}>
        <SidebarGroupContent className="flex flex-col gap-2">{menuItems}</SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (!showCollapsible) {
    return (
      <SidebarGroup key={group.id}>
        <SidebarGroupContent className="flex flex-col gap-2">{menuItems}</SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Collapsible key={group.id} open={open} onOpenChange={setOpen} className="group/nav-section">
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className={cn(GROUP_LABEL_CLASS, "w-full justify-between gap-2")}>
            <span>{translateTitle(group.label)}</span>
            <ChevronRight className="shrink-0 transition-transform duration-200 group-data-[state=open]/nav-section:rotate-90" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent className="flex flex-col gap-2">{menuItems}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
