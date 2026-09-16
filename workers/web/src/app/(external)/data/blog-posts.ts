export type BlogCategory = "product" | "credits";

export interface BlogPostMeta {
  slug: string;
  category: BlogCategory;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  readMinutes: number;
}

export const BLOG_AUTHOR_EMAIL = "support@aiagents-hub.vn";

/** Ordered newest first for listing */
export const BLOG_POST_METAS: BlogPostMeta[] = [
  {
    slug: "one-platform-one-credit-unlimited-models",
    category: "credits",
    date: "2026-09-16",
    readMinutes: 6,
  },
  {
    slug: "build-your-first-agent-workflow",
    category: "product",
    date: "2026-09-10",
    readMinutes: 5,
  },
  {
    slug: "agents-rag-memory-and-tools",
    category: "product",
    date: "2026-09-02",
    readMinutes: 7,
  },
  {
    slug: "webhooks-cron-and-hosted-chat",
    category: "product",
    date: "2026-08-21",
    readMinutes: 6,
  },
  {
    slug: "sharing-workflows-and-royalties",
    category: "credits",
    date: "2026-08-08",
    readMinutes: 5,
  },
  {
    slug: "subscription-credits-and-enterprise",
    category: "credits",
    date: "2026-07-22",
    readMinutes: 6,
  },
];

export function getPostMeta(slug: string): BlogPostMeta | undefined {
  return BLOG_POST_METAS.find((p) => p.slug === slug);
}

export function postsByCategory(category: BlogCategory): BlogPostMeta[] {
  return BLOG_POST_METAS.filter((p) => p.category === category);
}
