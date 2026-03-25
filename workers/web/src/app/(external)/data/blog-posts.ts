export type BlogCategory = "ekyc" | "claw";

export interface BlogPostMeta {
  slug: string;
  category: BlogCategory;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  readMinutes: number;
}

export const BLOG_AUTHOR_EMAIL = "admin@unitoken.trade";

/** Ordered newest first for listing */
export const BLOG_POST_METAS: BlogPostMeta[] = [
  {
    slug: "claw-integration-patterns-early-access",
    category: "claw",
    date: "2025-03-18",
    readMinutes: 5,
  },
  {
    slug: "claw-launch-what-partners-can-expect",
    category: "claw",
    date: "2025-03-04",
    readMinutes: 6,
  },
  {
    slug: "claw-roadmap-openclaw-nanoclaw-nemoclaw-bizclaw",
    category: "claw",
    date: "2025-02-19",
    readMinutes: 7,
  },
  {
    slug: "ekyc-data-minimization-retention-and-auditability",
    category: "ekyc",
    date: "2025-02-01",
    readMinutes: 7,
  },
  {
    slug: "ekyc-api-contracts-for-international-rollouts",
    category: "ekyc",
    date: "2025-01-14",
    readMinutes: 6,
  },
  {
    slug: "ekyc-how-we-deliver-identity-verification",
    category: "ekyc",
    date: "2025-01-02",
    readMinutes: 6,
  },
];

export function getPostMeta(slug: string): BlogPostMeta | undefined {
  return BLOG_POST_METAS.find((p) => p.slug === slug);
}

export function postsByCategory(category: BlogCategory): BlogPostMeta[] {
  return BLOG_POST_METAS.filter((p) => p.category === category);
}
