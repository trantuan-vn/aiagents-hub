import type { MetadataRoute } from "next";

import { APP_CONFIG } from "@/config/app-config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const origin = new URL(APP_CONFIG.homeUrl).origin;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/auth/", "/unauthorized", "/chat/", "/chat-test/"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: new URL(APP_CONFIG.homeUrl).host,
  };
}
