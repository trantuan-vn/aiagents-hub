import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DeleteOptions {
	dryRun: boolean;
}

/**
 * Delete all pipelines
 */
async function deletePipelines(options: DeleteOptions): Promise<void> {
	const { dryRun } = options;
	console.log('🗑️  Đang tìm và xóa pipelines...\n');

	try {
		const { stdout } = await execAsync('wrangler pipelines list --json');
		const pipelines = JSON.parse(stdout);

		if (Array.isArray(pipelines) && pipelines.length > 0) {
			console.log('Tìm thấy pipelines:');
			pipelines.forEach((p: any) => {
				console.log(`  • ${p.name} (ID: ${p.id})`);
			});

			if (dryRun) {
				console.log('\n[DRY RUN] Sẽ xóa các pipelines trên');
				return;
			}

			for (const pipeline of pipelines) {
				console.log(`Đang xóa pipeline ID: ${pipeline.id}`);
				try {
					await execAsync(`wrangler pipelines delete "${pipeline.id}" -y`);
					console.log(`  ✅ Đã xóa: ${pipeline.name}`);
				} catch (error: any) {
					console.error(`  ❌ Lỗi khi xóa ${pipeline.name}: ${error.message}`);
				}
			}
			console.log('\n✨ Đã xóa tất cả pipelines.');
		} else {
			console.log('Không tìm thấy pipeline nào.');
		}
	} catch (error: any) {
		if (error.message.includes('No pipelines found')) {
			console.log('Không tìm thấy pipeline nào.');
		} else {
			console.error(`❌ Lỗi: ${error.message}`);
		}
	}
}

/**
 * Delete all streams
 */
async function deleteStreams(options: DeleteOptions): Promise<void> {
	const { dryRun } = options;
	console.log('🗑️  Đang tìm và xóa streams...\n');

	try {
		const { stdout } = await execAsync('wrangler pipelines streams list --json');
		const streams = JSON.parse(stdout);

		if (Array.isArray(streams) && streams.length > 0) {
			console.log('Tìm thấy streams:');
			streams.forEach((s: any) => {
				console.log(`  • ${s.name} (ID: ${s.id})`);
			});

			if (dryRun) {
				console.log('\n[DRY RUN] Sẽ xóa các streams trên');
				return;
			}

			for (const stream of streams) {
				console.log(`Đang xóa stream ID: ${stream.id}`);
				try {
					await execAsync(`wrangler pipelines streams delete "${stream.id}" -y`);
					console.log(`  ✅ Đã xóa: ${stream.name}`);
				} catch (error: any) {
					console.error(`  ❌ Lỗi khi xóa ${stream.name}: ${error.message}`);
				}
			}
			console.log('\n✨ Đã xóa tất cả streams.');
		} else {
			console.log('Không tìm thấy stream nào.');
		}
	} catch (error: any) {
		if (error.message.includes('No streams found')) {
			console.log('Không tìm thấy stream nào.');
		} else {
			console.error(`❌ Lỗi: ${error.message}`);
		}
	}
}

/**
 * Delete all sinks
 */
async function deleteSinks(options: DeleteOptions): Promise<void> {
	const { dryRun } = options;
	console.log('🗑️  Đang tìm và xóa sinks...\n');

	try {
		const { stdout } = await execAsync('wrangler pipelines sinks list --json');
		
		// Handle case where output might not be valid JSON
		let sinks: any[] = [];
		try {
			sinks = JSON.parse(stdout);
		} catch {
			// Try to parse as text output
			if (stdout.includes('No sinks found') || stdout.trim() === '') {
				console.log('Không tìm thấy sink nào.');
				return;
			}
			// Try to extract from text format (similar to bash script)
			const lines = stdout.split('\n');
			const sinkNames: string[] = [];
			const sinkIds: string[] = [];
			
			// Extract names: match lines starting with whitespace + 'name:' + whitespace + 'value'
			for (const line of lines) {
				const nameMatch = line.match(/^\s*name:\s*'([^']*)'/);
				if (nameMatch) {
					sinkNames.push(nameMatch[1]);
				}
			}
			
			// Extract ids: match lines starting with whitespace + 'id:' + whitespace + 'value'
			for (const line of lines) {
				const idMatch = line.match(/^\s*id:\s*'([^']*)'/);
				if (idMatch) {
					sinkIds.push(idMatch[1]);
				}
			}
			
			// Pair names with ids (same index)
			for (let i = 0; i < sinkIds.length; i++) {
				sinks.push({
					id: sinkIds[i],
					name: sinkNames[i] || 'Unknown'
				});
			}
		}

		if (Array.isArray(sinks) && sinks.length > 0) {
			console.log(`Tìm thấy ${sinks.length} sink(s):`);
			sinks.forEach((s: any) => {
				console.log(`  • ${s.name || 'Unknown'} (ID: ${s.id})`);
			});

			if (dryRun) {
				console.log('\n[DRY RUN] Sẽ xóa các sinks trên');
				return;
			}

			for (const sink of sinks) {
				console.log(`Đang xóa sink ID: ${sink.id}`);
				try {
					await execAsync(`wrangler pipelines sinks delete "${sink.id}" -y`);
					console.log(`  ✅ Đã xóa: ${sink.name || sink.id}`);
				} catch (error: any) {
					console.error(`  ❌ Lỗi khi xóa ${sink.name || sink.id}: ${error.message}`);
				}
			}
			console.log('\n✨ Đã xóa tất cả sinks.');
		} else {
			console.log('Không tìm thấy sink nào.');
		}
	} catch (error: any) {
		if (error.message.includes('No sinks found') || error.message.includes('not found')) {
			console.log('Không tìm thấy sink nào.');
		} else {
			console.error(`❌ Lỗi: ${error.message}`);
		}
	}
}

/**
 * Delete all resources (pipelines → streams → sinks)
 */
export async function deleteAll(options: DeleteOptions): Promise<void> {
	const { dryRun } = options;
	
	console.log('🚀 Bắt đầu quá trình xóa tất cả resources...');
	console.log('='.repeat(50));
	console.log('');

	// Delete in correct order: pipelines → streams → sinks
	await deletePipelines(options);
	console.log('\n' + '-'.repeat(50) + '\n');
	
	await deleteStreams(options);
	console.log('\n' + '-'.repeat(50) + '\n');
	
	await deleteSinks(options);
	
	console.log('\n' + '='.repeat(50));
	console.log('✨ Hoàn tất quá trình xóa tất cả resources!');
}

/**
 * Delete only pipelines
 */
export async function deletePipelinesOnly(options: DeleteOptions): Promise<void> {
	await deletePipelines(options);
}

/**
 * Delete only streams
 */
export async function deleteStreamsOnly(options: DeleteOptions): Promise<void> {
	await deleteStreams(options);
}

/**
 * Delete only sinks
 */
export async function deleteSinksOnly(options: DeleteOptions): Promise<void> {
	await deleteSinks(options);
}

