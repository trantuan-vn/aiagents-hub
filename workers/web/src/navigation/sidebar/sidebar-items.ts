import {
  Banknote,
  BarChart3,
  Bell,
  Bot,
  Box,
  Brain,
  ChartBar,
  Code,
  Coins,
  CreditCard,
  FileText,
  GitBranch,
  Key,
  LayoutDashboard,
  RefreshCw,
  Send,
  Settings,
  Tag,
  Ticket,
  UserCircle,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  adminOnly?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  adminOnly?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Control",
    items: [
      { title: "Overview", url: "/dashboard/control/overview", icon: LayoutDashboard },
      { title: "Assistant", url: "/dashboard/control/assistant", icon: Bot },
      { title: "Account", url: "/dashboard/control/account", icon: UserCircle },
      { title: "API Keys", url: "/dashboard/control/token", icon: Key },
      { title: "Billing", url: "/dashboard/control/billing", icon: CreditCard },
      { title: "Notifications", url: "/dashboard/control/notifications", icon: Bell },
      { title: "Settings", url: "/dashboard/control/settings", icon: Settings },
    ],
  },
  {
    id: 2,
    label: "Monitor",
    items: [
      { title: "Logs", url: "/dashboard/monitor/logs", icon: FileText },
      { title: "Analytics", url: "/dashboard/monitor/analytics", icon: BarChart3 },
      { title: "Workflow Earnings", url: "/dashboard/build/workflows/earnings", icon: Wallet },
      { title: "Commissions", url: "/dashboard/monitor/commissions", icon: Coins },
    ],
  },
  {
    id: 3,
    label: "Dashboards",
    items: [
      {
        title: "Default",
        url: "/dashboard/default",
        icon: LayoutDashboard,
        adminOnly: true,
      },
      {
        title: "CRM",
        url: "/dashboard/crm",
        icon: ChartBar,
        adminOnly: true,
      },
      {
        title: "Finance",
        url: "/dashboard/finance",
        icon: Banknote,
        adminOnly: true,
      },
      {
        title: "Earnings Payouts",
        url: "/dashboard/earnings-payouts",
        icon: Wallet,
        adminOnly: true,
      },
      {
        title: "Exchange Rates",
        url: "/dashboard/exchange-rates",
        icon: RefreshCw,
        adminOnly: true,
      },
      {
        title: "Price Policy",
        url: "/dashboard/policy",
        icon: Tag,
        adminOnly: true,
      },
      {
        title: "Commission Policy",
        url: "/dashboard/commission-policy",
        icon: Banknote,
        adminOnly: true,
      },
      {
        title: "Discount Vouchers",
        url: "/dashboard/voucher",
        icon: Ticket,
        adminOnly: true,
      },
      {
        title: "Version Updates",
        url: "/dashboard/version",
        icon: RefreshCw,
        adminOnly: true,
      },
      {
        title: "System Configuration",
        url: "/dashboard/system-config",
        icon: Settings,
        adminOnly: true,
      },
      {
        title: "WebSocket Notify",
        url: "/dashboard/notify",
        icon: Send,
        adminOnly: true,
      },
    ],
  },
  {
    id: 5,
    label: "Workflow",
    items: [
      {
        title: "Workflow Admin",
        url: "/dashboard/workflow/nodes",
        icon: GitBranch,
        adminOnly: true,
        subItems: [
          { title: "Node Management", url: "/dashboard/workflow/nodes", icon: Box, adminOnly: true },
          { title: "Tool Management", url: "/dashboard/workflow/tools", icon: Wrench, adminOnly: true },
          { title: "Memory Management", url: "/dashboard/workflow/memory", icon: Brain, adminOnly: true },
          { title: "Service Management", url: "/dashboard/workflow/services", icon: Code, adminOnly: true },
        ],
      },
    ],
  },
  {
    id: 4,
    label: "Build",
    items: [{ title: "Agent Workflows", url: "/dashboard/build/workflows", icon: GitBranch, isNew: true }],
  },
];

// Helper function to filter sidebar items based on user role
export function filterSidebarItemsByRole(items: NavGroup[], userRole?: "member" | "admin"): NavGroup[] {
  const isAdmin = userRole === "admin";

  return items
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) =>
          item.subItems
            ? {
                ...item,
                subItems: item.subItems.filter((subItem) => !subItem.adminOnly || isAdmin),
              }
            : item,
        ),
    }))
    .filter((group) => group.items.length > 0);
}
