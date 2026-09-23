import { NextResponse, type NextRequest } from "next/server";

import { isScannerProbePath } from "@/lib/scanner-paths";
import { authMiddleware } from "./middleware/auth-middleware";

export async function middleware(req: NextRequest) {
  if (isScannerProbePath(req.nextUrl.pathname)) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return authMiddleware(req);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/auth/v3/login",
    /*
     * Exploit scanners (Joomla/WP/php). Keep marketing traffic off the auth
     * matcher; only invoke middleware for known junk path shapes.
     */
    "/index.php",
    "/:path*/index.php",
    "/:file(.*\\.php)",
    "/:file(.*\\.php\\d*)",
    "/:file(.*\\.phtml)",
    "/:file(.*\\.asp)",
    "/:file(.*\\.aspx)",
    "/:file(.*\\.jsp)",
    "/:file(.*\\.cgi)",
    "/:file(.*\\.bak)",
    "/:file(.*\\.sql)",
    "/wp-admin",
    "/wp-admin/:path*",
    "/wp-content/:path*",
    "/wp-includes/:path*",
    "/wordpress/:path*",
    "/phpmyadmin/:path*",
    "/phpinfo",
    "/administrator",
    "/administrator/:path*",
    "/.env",
    "/.git",
    "/.git/:path*",
  ],
};
