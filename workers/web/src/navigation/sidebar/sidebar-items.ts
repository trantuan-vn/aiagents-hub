import {
  ShoppingBag,
  Forklift,
  Mail,
  MessageSquare,
  Calendar,
  Kanban,
  ReceiptText,
  Users,
  Lock,
  Fingerprint,
  SquareArrowUpRight,
  LayoutDashboard,
  ChartBar,
  Banknote,
  Gauge,
  GraduationCap,
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
    label: "Dashboards",
    items: [
      {
        title: "Default",
        url: "/dashboard/default",
        icon: LayoutDashboard,
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
        title: "Analytics",
        url: "/dashboard/analytics",
        icon: Gauge,
        comingSoon: true,
      },
      {
        title: "E-commerce",
        url: "/dashboard/e-commerce",
        icon: ShoppingBag,
        comingSoon: true,
      },
      {
        title: "Academy",
        url: "/dashboard/academy",
        icon: GraduationCap,
        comingSoon: true,
      },
      {
        title: "Logistics",
        url: "/dashboard/logistics",
        icon: Forklift,
        comingSoon: true,
      },
    ],
  },
  {
    id: 2,
    label: "Pages",
    items: [
      {
        title: "Email",
        url: "/mail",
        icon: Mail,
        comingSoon: true,
      },
      {
        title: "Chat",
        url: "/chat",
        icon: MessageSquare,
        comingSoon: true,
      },
      {
        title: "Calendar",
        url: "/calendar",
        icon: Calendar,
        comingSoon: true,
      },
      {
        title: "Kanban",
        url: "/kanban",
        icon: Kanban,
        comingSoon: true,
      },
      {
        title: "Invoice",
        url: "/invoice",
        icon: ReceiptText,
        comingSoon: true,
      },
      {
        title: "Users",
        url: "/users",
        icon: Users,
        comingSoon: true,
      },
      {
        title: "Roles",
        url: "/roles",
        icon: Lock,
        comingSoon: true,
      },
      {
        title: "Authentication",
        url: "/auth",
        icon: Fingerprint,
        subItems: [
          { title: "Login v1", url: "/auth/v1/login", newTab: true },
          { title: "Login v2", url: "/auth/v2/login", newTab: true },
          { title: "Register v1", url: "/auth/v1/register", newTab: true },
          { title: "Register v2", url: "/auth/v2/register", newTab: true },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "Misc",
    items: [
      {
        title: "Others",
        url: "/others",
        icon: SquareArrowUpRight,
        comingSoon: true,
      },
    ],
  },
];

// Helper function to filter sidebar items based on user role
export function filterSidebarItemsByRole(items: NavGroup[], userRole?: "member" | "admin"): NavGroup[] {
  const isAdmin = userRole === "admin";

  return items.map(group => ({
    ...group,
    items: group.items
      .filter(item => {
        // Filter out admin-only items if user is not admin
        if (item.adminOnly && !isAdmin) {
          return false;
        }
        // Filter subItems as well
        if (item.subItems) {
          item.subItems = item.subItems.filter(subItem => {
            if (subItem.adminOnly && !isAdmin) {
              return false;
            }
            return true;
          });
        }
        return true;
      })
  }));
}
