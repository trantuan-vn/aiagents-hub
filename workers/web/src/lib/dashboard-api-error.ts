export type DashboardApiErrorBody = {
  error?: string;
  requiresStrongAuthSetup?: boolean;
  stepUpRequired?: boolean;
  availableMethods?: string[];
};

/** Parse dashboard API error body without surfacing raw JSON to users. */
export async function parseDashboardApiError(response: Response): Promise<DashboardApiErrorBody | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as DashboardApiErrorBody;
  } catch {
    return { error: text };
  }
}

export function dashboardApiErrorMessage(body: DashboardApiErrorBody | null, fallback: string): string {
  const msg = body?.error?.trim();
  return msg || fallback;
}
