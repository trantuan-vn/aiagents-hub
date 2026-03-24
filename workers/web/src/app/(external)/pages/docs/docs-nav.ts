export type DocsNavSection = {
  titleKey: "section_start" | "section_guides";
  items: { href: string; labelKey: "nav_overview" | "nav_quickstart" | "nav_api" }[];
};

export const DOCS_NAV: DocsNavSection[] = [
  {
    titleKey: "section_start",
    items: [
      { href: "/docs", labelKey: "nav_overview" },
      { href: "/docs/quickstart", labelKey: "nav_quickstart" },
    ],
  },
  {
    titleKey: "section_guides",
    items: [{ href: "/docs/api", labelKey: "nav_api" }],
  },
];
