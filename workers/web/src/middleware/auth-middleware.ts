import { NextResponse, type NextRequest } from "next/server";

import { getUserFromToken, type User } from "@/data/users";

function requiresAdminAccess(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard/crm") ||
    pathname.startsWith("/dashboard/finance") ||
    pathname.startsWith("/dashboard/system-config")
  );
}

function handleUnauthenticatedDashboard(req: NextRequest, pathname: string): NextResponse {
  console.log(`Redirecting to login page due to unauthenticated request to ${pathname}`);
  return NextResponse.redirect(new URL("/auth/v3/login", req.url));
}

function handleInsufficientPermissions(req: NextRequest, pathname: string): NextResponse {
  console.log(`Redirecting to default dashboard due to insufficient permissions for ${pathname}`);
  return NextResponse.redirect(new URL("/dashboard/control/overview", req.url));
}

function handleAuthenticatedLogin(req: NextRequest): NextResponse {
  console.log(`Redirecting to dashboard due to authenticated request to /auth/v3/login`);
  return NextResponse.redirect(new URL("/dashboard", req.url));
}

async function validateUserAuthentication(req: NextRequest) {
  const cookies = req.cookies;
  const token = cookies.get("token")?.value;
  const refreshToken = cookies.get("refreshToken")?.value;
  const sessionId = cookies.get("sessionId")?.value;

  const user = await getUserFromToken(token, refreshToken, sessionId);
  return { user, isLoggedIn: !!user };
}

function handleDashboardAccess(
  req: NextRequest,
  pathname: string,
  isLoggedIn: boolean,
  user: User | null,
): NextResponse | null {
  if (!isLoggedIn && pathname.startsWith("/dashboard")) {
    return handleUnauthenticatedDashboard(req, pathname);
  }

  if (isLoggedIn && requiresAdminAccess(pathname) && user?.role !== "admin") {
    return handleInsufficientPermissions(req, pathname);
  }

  return null;
}

export async function authMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { user, isLoggedIn } = await validateUserAuthentication(req);

  // Handle dashboard access
  const dashboardResult = handleDashboardAccess(req, pathname, isLoggedIn, user);
  if (dashboardResult) return dashboardResult;

  // Handle authenticated user trying to access login page
  if (isLoggedIn && pathname === "/auth/v3/login") {
    return handleAuthenticatedLogin(req);
  }

  console.log(`Auth middleware: Request to ${pathname} is ${isLoggedIn ? "" : "not"} authenticated.`);
  return NextResponse.next();
}
