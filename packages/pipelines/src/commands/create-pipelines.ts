import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadPipelineConfigs } from '../config-loader.js';

const execAsync = promisify(exec);

interface CreatePipelinesOptions {
	schemasDir: string;
	catalogToken: string;
	compression: string;
	rollSizeMb: string;
	rollInterval: string;
	dryRun: boolean;
}

interface PipelineConfig {
	schemaName: string;
	tableName: string;
	namespace: string;
	r2BucketName: string;
}

/**
 * Check if a stream exists by name
 */
async function streamExists(streamName: string): Promise<boolean> {
	try {
		const { stdout } = await execAsync('wrangler pipelines streams list --json');
		const streams = JSON.parse(stdout);
		if (Array.isArray(streams)) {
			return streams.some((s: any) => s.name === streamName);
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Check if a sink exists by name
 */
async function sinkExists(sinkName: string): Promise<boolean> {
	try {
		const { stdout } = await execAsync('wrangler pipelines sinks list --json');
		let sinks: any[] = [];
		try {
			sinks = JSON.parse(stdout);
		} catch {
			// Try to parse as text output
			const lines = stdout.split('\n');
			for (const line of lines) {
				const nameMatch = line.match(/^\s*name:\s*'([^']*)'/);
				if (nameMatch && nameMatch[1] === sinkName) {
					return true;
				}
			}
			return false;
		}
		if (Array.isArray(sinks)) {
			return sinks.some((s: any) => s.name === sinkName);
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Check if a pipeline exists by name
 */
async function pipelineExists(pipelineName: string): Promise<boolean> {
	try {
		const { stdout } = await execAsync('wrangler pipelines list --json');
		const pipelines = JSON.parse(stdout);
		if (Array.isArray(pipelines)) {
			return pipelines.some((p: any) => p.name === pipelineName);
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Create Cloudflare Pipelines (streams, sinks, and pipelines)
 */
export async function createPipelines(options: CreatePipelinesOptions): Promise<void> {
	const { schemasDir, catalogToken, compression, rollSizeMb, rollInterval, dryRun } = options;

	console.log(`🚀 Creating Cloudflare Pipelines...\n`);

	// Load configs dynamically
	const { PIPELINE_CONFIGS } = await loadPipelineConfigs();

	// Read all JSON schema files
	const files = await readdir(schemasDir);
	const schemaFiles = files.filter((f) => f.endsWith('.json'));

	if (schemaFiles.length === 0) {
		console.error(`❌ No schema files found in ${schemasDir}`);
		process.exit(1);
	}

	// Create a map of schemaName -> config for quick lookup
	const configMap = new Map<string, PipelineConfig>(
		(PIPELINE_CONFIGS as PipelineConfig[]).map((config) => [config.schemaName, config])
	);

	for (const schemaFile of schemaFiles) {
		const schemaName = basename(schemaFile, '.json');
		const config = configMap.get(schemaName);

		if (!config) {
			console.warn(`⚠️  Warning: No config found for schema ${schemaName}, skipping...`);
			continue;
		}

		const schemaFilePath = join(schemasDir, schemaFile);
		const streamName = `${config.tableName}_stream`;
		const sinkName = `${config.tableName}_sink`;
		const pipelineName = `${config.tableName}_pipeline`;

		console.log(`\n📋 Processing: ${schemaName}`);
		console.log(`   Table: ${config.tableName}`);
		console.log(`   Namespace: ${config.namespace}`);
		console.log(`   Bucket: ${config.r2BucketName}\n`);

		// Create Stream
		const streamExistsCheck = await streamExists(streamName);
		if (streamExistsCheck) {
			console.log(`🌀 Stream "${streamName}" already exists, skipping...`);
		} else {
			const streamCommand = `npx wrangler pipelines streams create "${streamName}" --schema-file "${schemaFilePath}" --http-enabled true --http-auth true`;
			console.log(`🌀 Creating Stream: ${streamName}`);
			if (dryRun) {
				console.log(`   [DRY RUN] ${streamCommand}`);
			} else {
				try {
					await execAsync(streamCommand);
					console.log(`   ✅ Stream created`);
				} catch (error: any) {
					console.error(`   ❌ Failed to create stream: ${error.message}`);
					continue;
				}
			}
		}

		// Create Sink
		const sinkExistsCheck = await sinkExists(sinkName);
		if (sinkExistsCheck) {
			console.log(`🌀 Sink "${sinkName}" already exists, skipping...`);
		} else {
			const sinkCommand = `npx wrangler pipelines sinks create "${sinkName}" --type r2-data-catalog --bucket "${config.r2BucketName}" --namespace "${config.namespace}" --table "${config.tableName}" --catalog-token "${catalogToken}" --compression "${compression}" --roll-size "${rollSizeMb}" --roll-interval "${rollInterval}"`;
			console.log(`🌀 Creating Sink: ${sinkName} (R2 Data Catalog)`);
			if (dryRun) {
				console.log(`   [DRY RUN] ${sinkCommand}`);
			} else {
				try {
					await execAsync(sinkCommand);
					console.log(`   ✅ Sink created`);
				} catch (error: any) {
					console.error(`   ❌ Failed to create sink: ${error.message}`);
					continue;
				}
			}
		}

		// Create Pipeline
		const pipelineExistsCheck = await pipelineExists(pipelineName);
		if (pipelineExistsCheck) {
			console.log(`🌀 Pipeline "${pipelineName}" already exists, skipping...`);
		} else {
			const pipelineCommand = `npx wrangler pipelines create "${pipelineName}" --sql "INSERT INTO ${sinkName} SELECT * FROM ${streamName}"`;
			console.log(`🌀 Creating Pipeline: ${pipelineName} (simple ingestion)`);
			if (dryRun) {
				console.log(`   [DRY RUN] ${pipelineCommand}`);
			} else {
				try {
					await execAsync(pipelineCommand);
					console.log(`   ✅ Pipeline created`);
				} catch (error: any) {
					console.error(`   ❌ Failed to create pipeline: ${error.message}`);
				}
			}
		}
	}

	console.log(`\n✨ Pipeline creation process completed!`);
}

