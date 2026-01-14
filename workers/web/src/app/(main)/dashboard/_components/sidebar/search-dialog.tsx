"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { User } from "@/data/users";
import { sidebarItems, filterSidebarItemsByRole } from "@/navigation/sidebar/sidebar-items";

interface SearchDialogProps {
  readonly user: User | null;
}

export function SearchDialog({ user }: SearchDialogProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const t = useTranslations("Sidebar");

  // Get filtered sidebar items based on user role
  const filteredItems = React.useMemo(() => {
    return filterSidebarItemsByRole(sidebarItems, user?.role);
  }, [user?.role]);

  // Build search items from filtered sidebar items
  const searchItems = React.useMemo(() => {
    const items: Array<{
      group: string;
      icon?: React.ComponentType<{ className?: string }>;
      label: string;
      url: string;
      disabled?: boolean;
      adminOnly?: boolean;
    }> = [];

    filteredItems.forEach((group) => {
      group.items.forEach((item) => {
        // Add main item
        items.push({
          group: group.label ?? "",
          icon: item.icon,
          label: item.title,
          url: item.url,
          disabled: item.comingSoon,
          adminOnly: item.adminOnly,
        });

        // Add sub items if any
        if (item.subItems) {
          item.subItems.forEach((subItem) => {
            items.push({
              group: group.label ?? "",
              icon: subItem.icon,
              label: subItem.title,
              url: subItem.url,
              disabled: subItem.comingSoon,
              adminOnly: subItem.adminOnly,
            });
          });
        }
      });
    });

    return items;
  }, [filteredItems]);

  // Translation mapping for search items
  const translateTitle = React.useCallback(
    (title: string): string => {
      const translationMap: Record<string, string> = {
        Dashboards: t("dashboards"),
        Pages: t("pages"),
        Misc: t("misc"),
        Default: t("default"),
        CRM: t("crm"),
        Finance: t("finance"),
        Analytics: t("analytics"),
        "E-commerce": t("ecommerce"),
        Academy: t("academy"),
        Logistics: t("logistics"),
        Email: t("email"),
        Chat: t("chat"),
        Calendar: t("calendar"),
        Kanban: t("kanban"),
        Invoice: t("invoice"),
        Users: t("users"),
        Roles: t("roles"),
        Authentication: t("authentication"),
        "Login v1": t("login_v1"),
        "Login v2": t("login_v2"),
        "Register v1": t("register_v1"),
        "Register v2": t("register_v2"),
        Others: t("others"),
      };
      return translationMap[title] ?? title;
    },
    [t],
  );

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = (item: (typeof searchItems)[0]) => {
    if (item.disabled) {
      return;
    }
    setOpen(false);
    if (item.url) {
      router.push(item.url);
    }
  };

  return (
    <>
      <Button
        variant="link"
        className="text-muted-foreground !px-0 font-normal hover:no-underline"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        {t("search")}
        <kbd className="bg-muted inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[10px] font-medium select-none">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t("search_placeholder")} />
        <CommandList>
          <CommandEmpty>{t("no_results")}</CommandEmpty>
          {[...new Set(searchItems.map((item) => item.group))].map((group, i) => (
            <React.Fragment key={group}>
              {i !== 0 && <CommandSeparator />}
              <CommandGroup heading={translateTitle(group)} key={group}>
                {searchItems
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <CommandItem
                      className="!py-1.5"
                      key={item.label}
                      disabled={item.disabled}
                      onSelect={() => handleSelect(item)}
                    >
                      {item.icon && <item.icon />}
                      <span>{translateTitle(item.label)}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
