import { exportSchemas } from './export-schemas.js';
import { createPipelines } from './create-pipelines.js';

interface ExportAndCreateOptions {
	outputDir: string;
	catalogToken: string;
	compression: string;
	rollSizeMb: string;
	rollInterval: string;
	dryRun: boolean;
}

/**
 * Export schemas and create pipelines in one command
 */
export async function exportAndCreate(options: ExportAndCreateOptions): Promise<void> {
	console.log('🚀 Starting pipeline setup process...\n');

	// Step 1: Export schemas
	await exportSchemas(options.outputDir);

	console.log('\n' + '='.repeat(60) + '\n');

	// Step 2: Create pipelines
	await createPipelines({
		schemasDir: options.outputDir,
		catalogToken: options.catalogToken,
		compression: options.compression,
		rollSizeMb: options.rollSizeMb,
		rollInterval: options.rollInterval,
		dryRun: options.dryRun,
	});

	console.log('\n✨ All done!');
}

