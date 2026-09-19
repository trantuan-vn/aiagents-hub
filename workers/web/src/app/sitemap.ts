import type { MetadataRoute } from "next";

import { APP_CONFIG } from "@/config/app-config";

export const dynamic = "force-static";

const PATHS = [
  "/",
  "/packages",
  "/about",
  "/blog",
  "/careers",
  "/contact",
  "/community",
  "/support",
  "/terms",
  "/privacy",
  "/cookies",
  "/docs",
  "/docs/quickstart",
  "/docs/platform",
  "/docs/workflows",
  "/docs/agents",
  "/docs/triggers",
  "/docs/credits",
  "/docs/plans",
  "/docs/sharing",
  "/docs/api",
  "/docs/enterprise",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = new URL(APP_CONFIG.homeUrl).origin;
  return PATHS.map((path) => ({
    url: path === "/" ? `${origin}/` : `${origin}${path}`,
    changeFrequency: path === "/" || path === "/packages" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/packages" ? 0.9 : path.startsWith("/docs") ? 0.7 : 0.6,
  }));
}
