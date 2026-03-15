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

export async function getUserFromToken(
  token: string | undefined,
  refreshToken: string | undefined,
  sessionId: string | undefined,
): Promise<GetUserResult> {
  try {
    // Cần sessionId + refreshToken để server có thể refresh khi token hết hạn
    if (!refreshToken || !sessionId) {
      return { user: null };
    }

    const cookieHeader = buildCookieHeader(token, refreshToken, sessionId);
    const apiUrl = process.env.AUTH_API_URL ?? "https://api.unitoken.trade/dashboard/auth";
    const response = await fetch(`${apiUrl}/profile/me`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { user: null };
      }
      console.error(`Failed to get user profile: ${response.status} ${response.statusText}`);
      return { user: null };
    }

    const data: UserProfileResponse = await response.json();
    const user = parseUserProfile(data);

    // Forward Set-Cookie từ API khi refresh token thành công (token mới cần được gửi về client)
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : undefined;

    return { user, setCookies };
  } catch (error) {
    console.error("Error getting user from token:", error);
    return { user: null };
  }
}
