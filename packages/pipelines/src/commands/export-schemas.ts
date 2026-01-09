import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { loadPipelineConfigs } from '../config-loader.js';

/**
 * Export all pipeline schemas to JSON files
 */
export async function exportSchemas(outputDir: string): Promise<void> {
	console.log(`📦 Exporting pipeline schemas to ${outputDir}...\n`);

	// Load configs dynamically
	const { PIPELINE_CONFIGS, exportPipelineSchemaAsJSON } = await loadPipelineConfigs();

	// Create output directory if it doesn't exist
	await mkdir(outputDir, { recursive: true });

	let exportedCount = 0;

	for (const config of PIPELINE_CONFIGS) {
		const schemaJson = exportPipelineSchemaAsJSON(config);
		const fileName = `${config.schemaName}.json`;
		const filePath = join(outputDir, fileName);

		await writeFile(filePath, schemaJson, 'utf-8');
		console.log(`✅ Exported: ${fileName}`);
		exportedCount++;
	}

	console.log(`\n✨ Successfully exported ${exportedCount} schema files to ${outputDir}`);
}

