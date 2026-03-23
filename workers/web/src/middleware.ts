// ⚠️ This middleware has been temporarily disabled to avoid unnecessary edge function executions.
// To re-enable, rename this file to `middleware.ts`.
import type { NextRequest } from "next/server";

import { authMiddleware } from "./middleware/auth-middleware";

export async function middleware(req: NextRequest) {
  return authMiddleware(req);
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/v3/login"],
};
