import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load pipeline configs by dynamically importing from the worker
 * This works around tsx module resolution issues with path aliases
 */
export async function loadPipelineConfigs() {
	// Use dynamic import with file:// URL (required on Windows)
	const configPath = join(__dirname, '../../../workers/d1tor2-cron/src/pipelines/config.ts');
	
	try {
		const configModule = await import(pathToFileURL(configPath).href);
		return {
			PIPELINE_CONFIGS: configModule.PIPELINE_CONFIGS,
			exportPipelineSchemaAsJSON: configModule.exportPipelineSchemaAsJSON,
		};
	} catch (error) {
		console.error('Failed to load pipeline configs:', error);
		throw error;
	}
}

