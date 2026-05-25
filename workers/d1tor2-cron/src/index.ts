/**
 * D1 to R2 Pipeline Worker
 * 
 * Worker này chạy theo cron schedule để sync data từ D1 database sang R2 bucket catalog.
 * Mỗi schema sẽ có một pipeline riêng để sync data.
 */

import { PipelineManager } from './pipelines/pipeline-manager';
import { createLogger } from './shared/logger';

const log = createLogger('d1tor2-cron');

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

export default {
	async fetch(req, env, ctx) {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Health check endpoint
		if (pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok' }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Manual trigger endpoint (for testing)
		if (pathname === '/trigger' && req.method === 'POST') {
			try {
				const pipelineManager = await getPipelineManager(env.D1DB, env);
				const stats = await pipelineManager.runAllPipelines();
				return new Response(JSON.stringify(stats, null, 2), {
					headers: { 'Content-Type': 'application/json' },
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return new Response(JSON.stringify({ error: errorMessage }), {
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				});
			}
		}

		return new Response('Not Found', { status: 404 });
	},

	// The scheduled handler is invoked at the interval set in wrangler.jsonc's triggers configuration
	// Chạy hàng ngày để đẩy dữ liệu ngày xa nhất từ D1 sang R2, sau đó xóa khỏi D1
	// Đảm bảo giữ lại D1_RETENTION_DAYS ngày gần nhất trong D1
	async scheduled(event, env, ctx): Promise<void> {
		const startedAt = Date.now();
		log.info('cron.started', { cron: event.cron });
		try {
			const pipelineManager = await getPipelineManager(env.D1DB, env);
			const stats = await pipelineManager.runAllPipelines();

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
