import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load pipeline configs by dynamically importing from the worker
 * This works around tsx module resolution issues with path aliases
 */
export async function loadPipelineConfigs() {
	// Use dynamic import with full path
	const configPath = join(__dirname, '../../../workers/d1tor2-cron/src/pipelines/config.ts');
	
	try {
		// Try to import the config module
		const configModule = await import(configPath);
		return {
			PIPELINE_CONFIGS: configModule.PIPELINE_CONFIGS,
			exportPipelineSchemaAsJSON: configModule.exportPipelineSchemaAsJSON,
		};
	} catch (error) {
		console.error('Failed to load pipeline configs:', error);
		throw error;
	}
}

