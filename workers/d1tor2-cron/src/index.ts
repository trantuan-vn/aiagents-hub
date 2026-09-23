/**
 * D1 to R2 Pipeline Worker
 *
 * Worker này chạy theo cron schedule để sync data từ D1 database sang R2 bucket catalog.
 * Mỗi schema sẽ có một pipeline riêng để sync data.
 */

import { PipelineManager, type PipelineStats } from './pipelines/pipeline-manager';
import { recordPipelineCronRun } from './pipelines/record-cron-run';
import { createLogger } from './shared/logger';

const log = createLogger('d1tor2-cron');

/** Must match auth-worker pipeline-health INTERNAL_TRIGGER_* */
const INTERNAL_HEADER = 'X-Hub-Admin-Action';
const INTERNAL_VALUE = 'pipeline-health';

// Cache pipeline manager instance to avoid recreating it on every request/cron trigger
let pipelineManager: PipelineManager | null = null;

const getPipelineManager = async (db: D1Database, env: Env): Promise<PipelineManager> => {
	if (!pipelineManager) {
		const accountId = (env as any).CLOUDFLARE_ACCOUNT_ID;
		const apiToken = await (env as any).CLOUDFLARE_API_TOKEN.get();
		pipelineManager = new PipelineManager(db, env, accountId, apiToken);
	}
	return pipelineManager;
};

function isInternalAdminTrigger(req: Request): boolean {
	return req.headers.get(INTERNAL_HEADER) === INTERNAL_VALUE;
}

async function runAndRecord(
	env: Env,
	runner: (pm: PipelineManager) => Promise<PipelineStats>,
): Promise<PipelineStats> {
	const startedAt = Date.now();
	const pm = await getPipelineManager(env.D1DB, env);
	const stats = await runner(pm);
	try {
		await recordPipelineCronRun(env.D1DB, stats, startedAt, Date.now());
	} catch (recordErr) {
		log.error('cron.record_run_failed', {
			error: recordErr instanceof Error ? recordErr.message : String(recordErr),
		});
	}
	return stats;
}

export default {
	async fetch(req, env, ctx) {
		void ctx;
		const url = new URL(req.url);
		const pathname = url.pathname;

		if (pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok' }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Admin / service-binding trigger only (header gate). No public cron UI.
		if (pathname === '/trigger' && req.method === 'POST') {
			if (!isInternalAdminTrigger(req)) {
				return new Response(JSON.stringify({ error: 'forbidden', code: 'internal_only' }), {
					status: 403,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			try {
				const body = (await req.json().catch(() => ({}))) as { table?: string; all?: boolean };
				const table = typeof body.table === 'string' ? body.table.trim() : '';
				const stats = await runAndRecord(env, async (pm) => {
					if (table) {
						const result = await pm.runPipelineByTable(table);
						return {
							totalPipelines: 1,
							successful: result.success ? 1 : 0,
							failed: result.success ? 0 : 1,
							results: [result],
						};
					}
					return pm.runAllPipelines();
				});
				return new Response(JSON.stringify(stats, null, 2), {
					headers: { 'Content-Type': 'application/json' },
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				const status = /not found/i.test(errorMessage) ? 404 : 500;
				return new Response(JSON.stringify({ error: errorMessage }), {
					status,
					headers: { 'Content-Type': 'application/json' },
				});
			}
		}

		return new Response('Not Found', { status: 404 });
	},

	async scheduled(event, env, ctx): Promise<void> {
		void ctx;
		const startedAt = Date.now();
		log.info('cron.started', { cron: event.cron });
		try {
			const stats = await runAndRecord(env, (pm) => pm.runAllPipelines());

			const failedPipelines = stats.results.filter((r) => !r.success);
			for (const result of failedPipelines) {
				log.error('cron.pipeline_failed', {
					pipeline: result.pipelineName,
					table: result.tableName,
					error: result.error,
				});
			}

			log.info('cron.completed', {
				cron: event.cron,
				total: stats.totalPipelines,
				successful: stats.successful,
				failed: stats.failed,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			log.error('cron.failed', error instanceof Error ? error : { error: String(error) });
			throw error;
		}
	},
} satisfies ExportedHandler<Env>;
