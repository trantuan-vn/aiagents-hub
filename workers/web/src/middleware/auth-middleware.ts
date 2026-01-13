import { NextResponse, type NextRequest } from "next/server";

import { getUserFromToken } from "@/data/users";

export async function authMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Get cookies from request
  const cookies = req.cookies;

  const token = cookies.get("token")?.value;
  const refreshToken = cookies.get("refreshToken")?.value;
  const sessionId = cookies.get("sessionId")?.value;

  const user = await getUserFromToken(token, refreshToken, sessionId);
  const isLoggedIn = !!user;

  if (!isLoggedIn && pathname.startsWith("/dashboard")) {
    console.log(`Redirecting to login page due to unauthenticated request to ${pathname}`);
    return NextResponse.redirect(new URL("/auth/v3/login", req.url));
  }

  if (isLoggedIn && pathname === "/auth/v3/login") {
    console.log(`Redirecting to dashboard due to authenticated request to ${pathname}`);
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  console.log(`Auth middleware: Request to ${pathname} is ${isLoggedIn ? "" : "not"} authenticated.`);
  return NextResponse.next();
}
