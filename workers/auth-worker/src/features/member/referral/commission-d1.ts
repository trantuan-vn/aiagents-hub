/** Read commissions from D1 after queue sync (DO records are cleaned up). */

export async function listCommissionsFromD1(
  db: D1Database,
  userId: string,
  fromTs: number,
  limit: number,
  offset: number,
  toTs?: number,
): Promise<Record<string, unknown>[]> {
  const sql =
    toTs != null
      ? `SELECT * FROM commissions
    WHERE user_id = ? AND created_at >= ? AND created_at < ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM commissions
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const result =
    toTs != null
      ? await db.prepare(sql).bind(userId, fromTs, toTs, limit, offset).all()
      : await db.prepare(sql).bind(userId, fromTs, limit, offset).all();
  return (result.results ?? []) as Record<string, unknown>[];
}

export async function getCommissionStatsInRange(
  db: D1Database,
  userId: string,
  fromTs: number,
  toTs: number,
): Promise<{ byDay: { date: string; total: number }[]; totalAmount: number }> {
  const sql = `SELECT created_at, "commissionAmount" FROM commissions
    WHERE user_id = ? AND created_at >= ? AND created_at < ?
    ORDER BY created_at ASC`;
  const result = await db.prepare(sql).bind(userId, fromTs, toTs).all<{
    created_at?: number;
    commissionAmount?: number;
  }>();
  const byDate = new Map<string, number>();
  for (const r of result.results ?? []) {
    const ts = r.created_at ?? 0;
    const dateKey = new Date(ts).toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + Number(r.commissionAmount ?? 0));
  }
  const byDay = Array.from(byDate.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalAmount = byDay.reduce((sum, d) => sum + d.total, 0);
  return { byDay, totalAmount };
}

export async function getCommissionStatsFromD1(
  db: D1Database,
  userId: string,
  fromTs: number,
): Promise<{ byDay: { date: string; total: number }[]; totalAmount: number }> {
  const sql = `SELECT created_at, "commissionAmount" FROM commissions
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at ASC`;
  const result = await db.prepare(sql).bind(userId, fromTs).all<{
    created_at?: number;
    commissionAmount?: number;
  }>();
  const byDate = new Map<string, number>();
  for (const r of result.results ?? []) {
    const ts = r.created_at ?? 0;
    const dateKey = new Date(ts).toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) || 0) + Number(r.commissionAmount ?? 0));
  }
  const byDay = Array.from(byDate.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalAmount = byDay.reduce((sum, d) => sum + d.total, 0);
  return { byDay, totalAmount };
}
