export interface User {
  id: string;
  identifier: string;
}

interface UserProfileResponse {
  id?: string;
  identifier?: string;
  address?: string;
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
    };
  }
  return null;
}

export async function getUserFromToken(
  token: string | undefined,
  refreshToken: string | undefined,
  sessionId: string | undefined,
): Promise<User | null> {
  try {
    if (!token) {
      return null;
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
        return null;
      }
      console.error(`Failed to get user profile: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: UserProfileResponse = await response.json();
    return parseUserProfile(data);
  } catch (error) {
    console.error("Error getting user from token:", error);
    return null;
  }
}
