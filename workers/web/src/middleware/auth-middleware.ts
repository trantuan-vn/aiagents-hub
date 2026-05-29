import { NextResponse, type NextRequest } from "next/server";

import { getUserFromToken, getClientIPFromHeaders, getClientUAFromHeaders, type User } from "@/data/users";

function requiresAdminAccess(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard/crm") ||
    pathname.startsWith("/dashboard/finance") ||
    pathname.startsWith("/dashboard/system-config") ||
    pathname.startsWith("/dashboard/commission-policy") ||
    pathname.startsWith("/dashboard/earnings-payouts") ||
    pathname.startsWith("/dashboard/user-groups")
  );
}

function handleUnauthenticatedDashboard(req: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL("/auth/v3/login", req.url));
}

function handleInsufficientPermissions(req: NextRequest, pathname: string): NextResponse {
  return NextResponse.redirect(new URL("/dashboard/control/overview", req.url));
}

function handleAuthenticatedLogin(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/dashboard", req.url));
}

async function validateUserAuthentication(req: NextRequest) {
  const cookies = req.cookies;
  const token = cookies.get("token")?.value;
  const refreshToken = cookies.get("refreshToken")?.value;
  const sessionId = cookies.get("sessionId")?.value;

  const clientIp = getClientIPFromHeaders(req.headers);
  const clientUserAgent = getClientUAFromHeaders(req.headers);

  const { user, setCookies } = await getUserFromToken(token, refreshToken, sessionId, {
    ip: clientIp,
    ua: clientUserAgent,
  });
  return { user, isLoggedIn: !!user, setCookies };
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
  const { user, isLoggedIn, setCookies } = await validateUserAuthentication(req);

  // Handle dashboard access
  const dashboardResult = handleDashboardAccess(req, pathname, isLoggedIn, user);
  if (dashboardResult) return dashboardResult;

  // Handle authenticated user trying to access login page
  if (isLoggedIn && pathname === "/auth/v3/login") {
    return handleAuthenticatedLogin(req);
  }

  const response = NextResponse.next();
  if (setCookies?.length) {
    for (const cookie of setCookies) {
      response.headers.append("Set-Cookie", cookie);
    }
  }
  return response;
}
