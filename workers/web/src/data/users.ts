export interface User {
  id: string;
  identifier: string;
  role?: "member" | "admin";
}

interface UserProfileResponse {
  id?: string;
  identifier?: string;
  address?: string;
  role?: "member" | "admin";
}

function buildCookieHeader(
  token: string | undefined,
  refreshToken: string | undefined,
  sessionId: string | undefined,
): string {
  const cookieParts: string[] = [];
  if (token) cookieParts.push(`token=${token}`);
  if (refreshToken) cookieParts.push(`refreshToken=${refreshToken}`);
  if (sessionId) cookieParts.push(`sessionId=${sessionId}`);
  return cookieParts.join("; ");
}

function parseUserProfile(data: UserProfileResponse): User | null {
  if (data.id && data.identifier) {
    return {
      id: data.id,
      identifier: data.identifier,
      role: data.role ?? "member",
    };
  }
  return null;
}

export interface GetUserResult {
  user: User | null;
  /** Cookie chuỗi Set-Cookie từ API (khi refresh token thành công) - dùng để forward về client */
  setCookies?: string[];
}

/** Lấy IP từ headers (CF-Connecting-IP, X-Real-IP, X-Forwarded-For) */
export function getClientIPFromHeaders(headers: Headers): string | undefined {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const real = headers.get("x-real-ip");
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return undefined;
}

/** Lấy User-Agent từ headers */
export function getClientUAFromHeaders(headers: Headers): string | undefined {
  return headers.get("user-agent") ?? undefined;
}

function buildProfileRequestHeaders(cookieHeader: string, opts?: { ip?: string; ua?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    "Content-Type": "application/json",
  };
  if (opts?.ip) headers["X-Client-IP"] = opts.ip;
  if (opts?.ua) headers["X-Client-UA"] = opts.ua;
  return headers;
}

function getSetCookiesFromResponse(response: Response): string[] | undefined {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  return undefined;
}

async function fetchUserProfile(apiUrl: string, headers: Record<string, string>): Promise<GetUserResult> {
  const response = await fetch(`${apiUrl}/profile/me`, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) return { user: null };
    console.error(`Failed to get user profile: ${response.status} ${response.statusText}`);
    return { user: null };
  }

  const data: UserProfileResponse = await response.json();
  const user = parseUserProfile(data);
  const setCookies = getSetCookiesFromResponse(response);
  return { user, setCookies };
}

export async function getUserFromToken(
  token: string | undefined,
  refreshToken: string | undefined,
  sessionId: string | undefined,
  opts?: { ip?: string; ua?: string },
): Promise<GetUserResult> {
  try {
    if (!sessionId) return { user: null };

    const cookieHeader = buildCookieHeader(token, refreshToken, sessionId);
    const apiUrl = process.env.AUTH_API_URL ?? "https://api.unitoken.trade/dashboard/auth";
    const headers = buildProfileRequestHeaders(cookieHeader, opts);
    return fetchUserProfile(apiUrl, headers);
  } catch (error) {
    console.error("Error getting user from token:", error);
    return { user: null };
  }
}
