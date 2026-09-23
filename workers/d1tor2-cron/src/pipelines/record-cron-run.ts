/**
 * Persist d1tor2 cron run into shared D1 for admin pipeline-health.
 * Failures here must not fail the cron job itself.
 */
export async function recordPipelineCronRun(
  db: D1Database,
  stats: {
    totalPipelines: number;
    successful: number;
    failed: number;
    results: Array<{
      pipelineName: string;
      tableName: string;
      success: boolean;
      recordsProcessed: number;
      error?: string;
      timestamp: string;
    }>;
  },
  startedAt: number,
  finishedAt: number,
): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS pipeline_cron_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER NOT NULL,
        success INTEGER NOT NULL,
        total_pipelines INTEGER NOT NULL,
        successful INTEGER NOT NULL,
        failed INTEGER NOT NULL,
        payload TEXT NOT NULL
      )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_pipeline_cron_finished ON pipeline_cron_runs (finished_at DESC)`)
    .run();

  const success = stats.failed === 0;
  await db
    .prepare(
      `INSERT INTO pipeline_cron_runs
       (started_at, finished_at, success, total_pipelines, successful, failed, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      startedAt,
      finishedAt,
      success ? 1 : 0,
      stats.totalPipelines,
      stats.successful,
      stats.failed,
      JSON.stringify({ results: stats.results }),
    )
    .run();

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  await db.prepare(`DELETE FROM pipeline_cron_runs WHERE finished_at < ?`).bind(cutoff).run();
}
