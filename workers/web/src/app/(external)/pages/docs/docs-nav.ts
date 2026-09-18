export type DocsNavItem = {
  href: string;
  labelKey: string;
};

export type DocsNavSection = {
  titleKey: string;
  items: DocsNavItem[];
};

export const DOCS_NAV: DocsNavSection[] = [
  {
    titleKey: "section.start",
    items: [
      { href: "/docs", labelKey: "nav.overview" },
      { href: "/docs/quickstart", labelKey: "nav.quickstart" },
      { href: "/docs/platform", labelKey: "nav.platform" },
    ],
  },
  {
    titleKey: "section.product",
    items: [
      { href: "/docs/workflows", labelKey: "nav.workflows" },
      { href: "/docs/agents", labelKey: "nav.agents" },
      { href: "/docs/triggers", labelKey: "nav.triggers" },
    ],
  },
  {
    titleKey: "section.billing",
    items: [
      { href: "/docs/credits", labelKey: "nav.credits" },
      { href: "/docs/plans", labelKey: "nav.plans" },
      { href: "/docs/sharing", labelKey: "nav.sharing" },
    ],
  },
  {
    titleKey: "section.developers",
    items: [{ href: "/docs/api", labelKey: "nav.api" }],
  },
  {
    titleKey: "section.company",
    items: [{ href: "/docs/enterprise", labelKey: "nav.enterprise" }],
  },
];

export function flattenDocsNav(): DocsNavItem[] {
  return DOCS_NAV.flatMap((section) => section.items);
}

export function findDocsNavContext(pathname: string): {
  current?: DocsNavItem;
  previous?: DocsNavItem;
  next?: DocsNavItem;
  sectionTitleKey?: string;
} {
  const items = flattenDocsNav();
  const index = items.findIndex((item) =>
    item.href === "/docs" ? pathname === "/docs" : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (index < 0) return {};

  const current = items[index];
  const section = DOCS_NAV.find((s) => s.items.some((item) => item.href === current.href));

  return {
    current,
    previous: index > 0 ? items[index - 1] : undefined,
    next: index < items.length - 1 ? items[index + 1] : undefined,
    sectionTitleKey: section?.titleKey,
  };
}
