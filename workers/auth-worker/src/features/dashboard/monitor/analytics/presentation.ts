import { Hono } from "hono";
import { requireAuth } from "../../../auth/authMiddleware";
import { handleError } from "../../../../shared/utils";
import { getServiceUsageAnalytics, type AnalyticsDuration } from "./infrastructure";

const VALID_DURATIONS: AnalyticsDuration[] = ["week", "month", "quarter", "year"];

export function createMonitorAnalyticsRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c: any) => {
    try {
      const user = requireAuth(c);
      const db = c.env.D1DB;
      if (!db) {
        throw new Error("D1 database binding not configured");
      }
      const userId = (c.env[bindingName] as DurableObjectNamespace).idFromName(user.identifier).toString();

      const durationParam = (c.req.query("duration") ?? "month").toLowerCase();
      const duration: AnalyticsDuration = VALID_DURATIONS.includes(durationParam as AnalyticsDuration)
        ? (durationParam as AnalyticsDuration)
        : "month";

      const { daily, totalRequests, totalCost } = await getServiceUsageAnalytics(db, userId, duration);

      return c.json({
        daily,
        totalRequests,
        totalCost,
        duration,
      });
    } catch (e) {
      const { errorResponse, status } = await handleError(c, e, "Failed to get analytics");
      return c.json(errorResponse, status);
    }
  });

  return app;
}
