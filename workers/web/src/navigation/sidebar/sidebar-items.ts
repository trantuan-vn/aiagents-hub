import {
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ChartBar,
  Code,
  Cookie,
  CreditCard,
  Eye,
  FileText,
  HelpCircle,
  Key,
  LayoutDashboard,
  MessageSquare,
  Package,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  Tag,
  Ticket,
  UserCircle,
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
      { title: "Delivery & Quality", url: "/dashboard/monitor/delivery-quality", icon: Package },
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
        title: "Chính sách giá",
        url: "/dashboard/policy",
        icon: Tag,
        adminOnly: true,
      },
      {
        title: "Dịch vụ API",
        url: "/dashboard/service",
        icon: Code,
        adminOnly: true,
      },
      {
        title: "Voucher giảm giá",
        url: "/dashboard/voucher",
        icon: Ticket,
        adminOnly: true,
      },
      {
        title: "Phiên bản cập nhật",
        url: "/dashboard/version",
        icon: RefreshCw,
        adminOnly: true,
      },
    ],
  },
  {
    id: 4,
    label: "Build",
    items: [
      { title: "eKyc", url: "/dashboard/build/ekyc", icon: ShieldCheck },
      { title: "Messaging", url: "/dashboard/build/messaging", icon: MessageSquare },
    ],
  },
  {
    id: 5,
    label: "Useful Links",
    items: [
      { title: "Ask AI", url: "/dashboard/useful-links/ask-ai", icon: Bot },
      { title: "Documentation", url: "/dashboard/useful-links/documentation", icon: BookOpen },
      { title: "Support", url: "/dashboard/useful-links/support", icon: HelpCircle },
      {
        title: "Legal & Privacy",
        url: "/dashboard/useful-links/legal-privacy",
        icon: Scale,
        subItems: [
          { title: "Privacy Policy", url: "/dashboard/useful-links/legal-privacy/privacy-policy", icon: ShieldCheck },
          { title: "Cookie Settings", url: "/dashboard/useful-links/legal-privacy/cookie-settings", icon: Cookie },
          { title: "Your privacy choices", url: "/dashboard/useful-links/legal-privacy/privacy-choices", icon: Eye },
        ],
      },
    ],
  },
];

// Helper function to filter sidebar items based on user role
export function filterSidebarItemsByRole(items: NavGroup[], userRole?: "member" | "admin"): NavGroup[] {
  const isAdmin = userRole === "admin";

  return items
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // Filter out admin-only items if user is not admin
        if (item.adminOnly && !isAdmin) {
          return false;
        }
        // Filter subItems as well
        if (item.subItems) {
          item.subItems = item.subItems.filter((subItem) => {
            if (subItem.adminOnly && !isAdmin) {
              return false;
            }
            return true;
          });
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0); // Filter out groups with no items
}
