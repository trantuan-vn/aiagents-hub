/** Auth API error body (auth-worker 429 responses include retryAfter). */
export type AuthApiErrorBody = {
  error?: string;
  retryAfter?: number;
};

type LoginFormTranslate = (
  key: "rate_limit_retry_after" | "rate_limit_generic",
  values?: { seconds: number },
) => string;

export function formatAuthApiErrorMessage(
  body: AuthApiErrorBody | null | undefined,
  fallback: string,
  t: LoginFormTranslate,
  httpStatus?: number,
): string {
  const retryAfter =
    typeof body?.retryAfter === "number" && Number.isFinite(body.retryAfter) && body.retryAfter > 0
      ? Math.ceil(body.retryAfter)
      : undefined;

  if (retryAfter !== undefined) {
    return t("rate_limit_retry_after", { seconds: retryAfter });
  }

  if (httpStatus === 429) {
    return t("rate_limit_generic");
  }

  const serverMessage = body?.error?.trim();
  if (serverMessage) {
    return serverMessage;
  }

  return fallback;
}

export async function getAuthApiErrorMessage(
  response: Response,
  fallback: string,
  t: LoginFormTranslate,
): Promise<string> {
  try {
    const body: AuthApiErrorBody = await response.json();
    return formatAuthApiErrorMessage(body, fallback, t, response.status);
  } catch {
    return formatAuthApiErrorMessage(undefined, fallback, t, response.status);
  }
}
