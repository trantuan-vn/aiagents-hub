#!/usr/bin/env node

import { Command } from 'commander';
import { exportSchemas } from './commands/export-schemas.js';
import { createPipelines } from './commands/create-pipelines.js';
import { exportAndCreate } from './commands/export-and-create.js';
import {
	deleteAll,
	deletePipelinesOnly,
	deleteStreamsOnly,
	deleteSinksOnly,
} from './commands/delete-pipelines.js';

const program = new Command();

program
	.name('pipeline-cli')
	.description('CLI tool to export pipeline schemas and create Cloudflare Pipelines')
	.version('1.0.0');

program
	.command('export')
	.description('Export pipeline schemas to JSON files')
	.option('-o, --output <dir>', 'Output directory for schema files', './schemas')
	.action(async (options) => {
		await exportSchemas(options.output);
	});

program
	.command('create')
	.description('Create Cloudflare Pipelines (streams, sinks, and pipelines)')
	.option('-s, --schemas-dir <dir>', 'Directory containing schema JSON files', './schemas')
	.option('--catalog-token <token>', 'R2 Data Catalog token (required)', process.env.CATALOG_TOKEN)
	.option('--compression <type>', 'Compression type', 'zstd')
	.option('--roll-size-mb <size>', 'Roll size in MB', '100')
	.option('--roll-interval <seconds>', 'Roll interval in seconds', '300')
	.option('--dry-run', 'Print commands without executing', false)
	.action(async (options) => {
		if (!options.catalogToken && !options.dryRun) {
			console.error('❌ Error: --catalog-token is required (or set CATALOG_TOKEN env var)');
			process.exit(1);
		}
		await createPipelines({
			schemasDir: options.schemasDir,
			catalogToken: options.catalogToken || '',
			compression: options.compression,
			rollSizeMb: options.rollSizeMb,
			rollInterval: options.rollInterval,
			dryRun: options.dryRun,
		});
	});

program
	.command('all')
	.description('Export schemas and create pipelines in one command')
	.option('-o, --output <dir>', 'Output directory for schema files', './schemas')
	.option('--catalog-token <token>', 'R2 Data Catalog token (required)', process.env.CATALOG_TOKEN)
	.option('--compression <type>', 'Compression type', 'zstd')
	.option('--roll-size-mb <size>', 'Roll size in MB', '100')
	.option('--roll-interval <seconds>', 'Roll interval in seconds', '300')
	.option('--dry-run', 'Print commands without executing', false)
	.action(async (options) => {
		if (!options.catalogToken && !options.dryRun) {
			console.error('❌ Error: --catalog-token is required (or set CATALOG_TOKEN env var)');
			process.exit(1);
		}
		await exportAndCreate({
			outputDir: options.output,
			catalogToken: options.catalogToken || '',
			compression: options.compression,
			rollSizeMb: options.rollSizeMb,
			rollInterval: options.rollInterval,
			dryRun: options.dryRun,
		});
	});

program
	.command('delete')
	.description('Delete Cloudflare Pipelines resources')
	.option('--pipelines', 'Delete only pipelines', false)
	.option('--streams', 'Delete only streams', false)
	.option('--sinks', 'Delete only sinks', false)
	.option('--all', 'Delete all resources (pipelines → streams → sinks)', false)
	.option('--dry-run', 'Print what would be deleted without executing', false)
	.action(async (options) => {
		const deleteOptions = { dryRun: options.dryRun };

		if (options.all) {
			await deleteAll(deleteOptions);
		} else if (options.pipelines) {
			await deletePipelinesOnly(deleteOptions);
		} else if (options.streams) {
			await deleteStreamsOnly(deleteOptions);
		} else if (options.sinks) {
			await deleteSinksOnly(deleteOptions);
		} else {
			// Default: delete all if no specific option is provided
			await deleteAll(deleteOptions);
		}
	});

program.parse();

