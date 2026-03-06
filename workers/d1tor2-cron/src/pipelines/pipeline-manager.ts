import { z } from 'zod';
import { PIPELINE_CONFIGS, PipelineConfig, parseD1JsonFields } from './config';
import { CloudflarePipelineAPIService } from './pipeline-api-service';

export interface PipelineResult {
	pipelineName: string;
	tableName: string;
	success: boolean;
	recordsProcessed: number;
	error?: string;
	timestamp: string;
}

export interface PipelineStats {
	totalPipelines: number;
	successful: number;
	failed: number;
	results: PipelineResult[];
}

/**
 * Pipeline Manager - Quản lý việc sync data từ D1 database sang R2 Data Catalog
 * Sử dụng Cloudflare Pipelines để gửi data qua HTTP endpoints
 * Data sẽ được lưu dưới dạng Apache Iceberg tables trong R2 Data Catalog
 * 
 * Reference: https://developers.cloudflare.com/pipelines/getting-started/
 */
const KV_KEY = 'system_config';

/** Cấu hình d1tor2 đọc từ KV (có hiệu lực ngay khi admin thiết lập) */
interface D1tor2RuntimeConfig {
	PIPELINE_CONCURRENCY_LIMIT: number;
	BATCH_CONCURRENCY_LIMIT: number;
	D1_RETENTION_DAYS: number;
}

export class PipelineManager {
	private apiService: CloudflarePipelineAPIService | null = null;
	private endpointCache: Map<string, string> = new Map();
	private d1tor2Config: D1tor2RuntimeConfig | null = null;

	constructor(
		private db: D1Database,
		private env: Env,
		private accountId: string,
		private apiToken: string,
	) {
		if (accountId && apiToken) {
			try {
				this.apiService = new CloudflarePipelineAPIService(accountId, apiToken);
			} catch (error) {
				console.warn('Failed to initialize Cloudflare Pipeline API Service:', error);
				console.warn('Pipelines will need to be created manually or endpoints configured via env vars');
			}
		} else {
			console.warn('CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not found. Pipelines must be created manually or endpoints configured via env vars');
		}
	}

	/**
	 * Đọc cấu hình d1tor2 từ KV. Có hiệu lực ngay khi admin thiết lập.
	 */
	private async loadD1tor2Config(): Promise<void> {
		const defaults: D1tor2RuntimeConfig = {
			PIPELINE_CONCURRENCY_LIMIT: parseInt(String((this.env as any).PIPELINE_CONCURRENCY_LIMIT || '5'), 10),
			BATCH_CONCURRENCY_LIMIT: parseInt(String((this.env as any).BATCH_CONCURRENCY_LIMIT || '3'), 10),
			D1_RETENTION_DAYS: parseInt(String((this.env as any).D1_RETENTION_DAYS || '96'), 10),
		};
		const kv = (this.env as any).SYSTEM_CONFIG_KV;
		if (!kv) {
			this.d1tor2Config = defaults;
			return;
		}
		try {
			const raw = await kv.get(KV_KEY);
			if (!raw) {
				this.d1tor2Config = defaults;
				return;
			}
			const parsed = JSON.parse(raw);
			const dc = parsed.d1tor2_cron || {};
			this.d1tor2Config = {
				PIPELINE_CONCURRENCY_LIMIT: dc.PIPELINE_CONCURRENCY_LIMIT ?? defaults.PIPELINE_CONCURRENCY_LIMIT,
				BATCH_CONCURRENCY_LIMIT: dc.BATCH_CONCURRENCY_LIMIT ?? defaults.BATCH_CONCURRENCY_LIMIT,
				D1_RETENTION_DAYS: dc.D1_RETENTION_DAYS ?? defaults.D1_RETENTION_DAYS,
			};
		} catch {
			this.d1tor2Config = defaults;
		}
	}

	/**
	 * Tính toán concurrency limit tối ưu dựa trên Cloudflare Workers limits và environment variables
	 * 
	 * Cloudflare Workers limits:
	 * - 50 concurrent subrequests (HTTP requests) per worker
	 * - ~128MB memory default
	 * - Cron workers có thể có nhiều thời gian hơn nhưng vẫn cần giới hạn để tránh quá tải
	 * 
	 * @param type Loại concurrency: 'pipeline' hoặc 'batch'
	 * @param totalItems Tổng số items (pipelines hoặc batches) để tính toán heuristic
	 * @returns Concurrency limit tối ưu
	 */
	private getConcurrencyLimit(type: 'pipeline' | 'batch', totalItems?: number): number {
		const envKey = type === 'pipeline' 
			? 'PIPELINE_CONCURRENCY_LIMIT' 
			: 'BATCH_CONCURRENCY_LIMIT';
		
		// Ưu tiên lấy từ KV config (admin đã thiết lập)
		if (this.d1tor2Config) {
			const limit = type === 'pipeline' 
				? this.d1tor2Config.PIPELINE_CONCURRENCY_LIMIT 
				: this.d1tor2Config.BATCH_CONCURRENCY_LIMIT;
			console.log(`  Using ${envKey} from system config: ${limit}`);
			return Math.min(limit, 20);
		}
		
		// Fallback: env vars
		const envValue = (this.env as any)[envKey];
		if (envValue !== undefined) {
			const limit = parseInt(String(envValue), 10);
			if (!isNaN(limit) && limit > 0) {
				console.log(`  Using ${envKey} from env: ${limit}`);
				return Math.min(limit, 20); // Cap at 20 để tránh quá tải
			}
		}

		// Heuristic dựa trên Cloudflare Workers limits
		// Mỗi pipeline/batch có thể tạo:
		// - 1-3 D1 queries (query, update flushedAt, delete flushed)
		// - 1 HTTP request (send to pipeline endpoint)
		// - Có thể có thêm subrequests trong quá trình xử lý
		// Pipeline concurrency: mỗi pipeline có thể tạo ~3-5 subrequests
		// Với 50 concurrent subrequests limit, có thể chạy ~10-15 pipelines
		// Nhưng để an toàn và tối ưu memory, giới hạn ở 5-8
		// Batch concurrency: mỗi batch có thể tạo ~2-3 subrequests
		// Với 50 concurrent subrequests limit, có thể chạy ~15-20 batches
		// Nhưng để tối ưu memory và tránh quá tải D1, giới hạn ở 3-5
		// Điều chỉnh dựa trên số lượng batches (nếu biết)
		// Batch concurrency thường ổn định ở 3-5

		const defaultLimit = type === 'pipeline'? 5 : 3;
		// Điều chỉnh dựa trên số lượng pipelines
		if (totalItems !== undefined) {
			// Nếu có ít pipelines, có thể tăng concurrency
			if (totalItems <= 5) {
				return Math.min(totalItems, 5);
			}
			// Nếu có nhiều pipelines, giữ ở mức vừa phải
			return defaultLimit;
		}
		
		return defaultLimit;

	}

	/**
	 * Chạy tất cả các pipelines song song
	 * Mỗi pipeline sẽ tự động tìm ngày xa nhất có dữ liệu (trước cutoff = D1_RETENTION_DAYS ngày trước) và xử lý
	 * Xử lý nhiều pipelines cùng lúc để tăng hiệu suất
	 */
	async runAllPipelines(): Promise<PipelineStats> {
		await this.loadD1tor2Config();
		const concurrencyLimit = this.getConcurrencyLimit('pipeline', PIPELINE_CONFIGS.length);
		const results: PipelineResult[] = [];
		let successful = 0;
		let failed = 0;

		console.log(`Starting ${PIPELINE_CONFIGS.length} pipelines with concurrency limit of ${concurrencyLimit}...`);

		// Queue để quản lý các pipelines đang được xử lý
		const processingQueue: Array<{ promise: Promise<PipelineResult>; config: PipelineConfig }> = [];
		let configIndex = 0;

		while (configIndex < PIPELINE_CONFIGS.length || processingQueue.length > 0) {
			// Thêm pipelines vào queue cho đến khi đạt giới hạn concurrency
			while (configIndex < PIPELINE_CONFIGS.length && processingQueue.length < concurrencyLimit) {
				const config = PIPELINE_CONFIGS[configIndex];

				// Tạo promise để xử lý pipeline này song song
				const processPromise = this.runPipeline(config)
					.then((result) => {
						console.log(`✓ Pipeline ${config.schemaName} completed: ${result.recordsProcessed} records`);
						return result;
					})
					.catch((error) => {
						const errorMessage = error instanceof Error ? error.message : String(error);
						console.error(`✗ Pipeline ${config.schemaName} failed:`, errorMessage);
						return {
							pipelineName: config.schemaName,
							tableName: config.tableName,
							success: false,
							recordsProcessed: 0,
							error: errorMessage,
							timestamp: new Date().toISOString(),
						} as PipelineResult;
					});

				processingQueue.push({ promise: processPromise, config });
				configIndex++;
			}

			// Chờ một pipeline hoàn thành trước khi thêm pipeline tiếp theo
			if (processingQueue.length > 0) {
				// Wrap mỗi promise với index để biết pipeline nào hoàn thành
				const promisesWithIndex = processingQueue.map((item, index) => 
					item.promise
						.then(value => ({ status: 'fulfilled' as const, value, index }))
						.catch(reason => ({ status: 'rejected' as const, reason, index }))
				);
				
				// Chờ pipeline đầu tiên hoàn thành
				const completed = await Promise.race(promisesWithIndex);
				
				const completedItem = processingQueue[completed.index];
				let result: PipelineResult;

				if (completed.status === 'fulfilled') {
					result = completed.value;
				} else {
					// Nếu pipeline failed, tạo error result
					result = {
						pipelineName: completedItem.config.schemaName,
						tableName: completedItem.config.tableName,
						success: false,
						recordsProcessed: 0,
						error: completed.reason instanceof Error ? completed.reason.message : String(completed.reason),
						timestamp: new Date().toISOString(),
					};
				}

				results.push(result);
				if (result.success) {
					successful++;
				} else {
					failed++;
				}
				
				// Xóa pipeline đã hoàn thành khỏi queue
				processingQueue.splice(completed.index, 1);
			}
		}

		console.log(`Completed all pipelines: ${successful} successful, ${failed} failed`);

		return {
			totalPipelines: PIPELINE_CONFIGS.length,
			successful,
			failed,
			results,
		};
	}

	/**
	 * Chạy một pipeline cụ thể
	 * Tự động tìm ngày xa nhất có dữ liệu (trước cutoff = D1_RETENTION_DAYS ngày trước) và xử lý
	 * @param config Pipeline configuration
	 */
	async runPipeline(config: PipelineConfig): Promise<PipelineResult> {
		const startTime = Date.now();
		console.log(`Running pipeline: ${config.schemaName} (table: ${config.tableName})`);

		try {
			// 0. Đảm bảo pipeline, stream và sink đã được tạo
			await this.ensurePipelineSetup(config);

			// 1. Tìm ngày xa nhất có dữ liệu (trước cutoff = D1_RETENTION_DAYS ngày trước)
			const targetDate = await this.findOldestDateWithData(config.tableName);
			
			if (!targetDate) {
				console.log(`  No data found in ${config.tableName}, skipping...`);
				return {
					pipelineName: config.schemaName,
					tableName: config.tableName,
					success: true,
					recordsProcessed: 0,
					timestamp: new Date().toISOString(),
				};
			}

			console.log(`  Processing oldest date: ${targetDate.toISOString().split('T')[0]}`);

			// 2. Xử lý dữ liệu theo batch: query 10k -> validate -> send -> delete -> lặp lại
			// Thay vì query tất cả vào memory rồi mới đẩy, giờ sẽ xử lý từng batch để tối ưu memory
			const recordsProcessed = await this.processDataInBatches(config, targetDate);

			const duration = Date.now() - startTime;
			console.log(`  Pipeline ${config.schemaName} completed in ${duration}ms`);

			return {
				pipelineName: config.schemaName,
				tableName: config.tableName,
				success: true,
				recordsProcessed: recordsProcessed,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`  Pipeline ${config.schemaName} failed:`, errorMessage);
			throw error;
		}
	}

	/**
	 * Đảm bảo pipeline, stream và sink đã được tạo cho schema
	 * Kiểm tra xem schema đã có pipeline chưa, nếu chưa thì tạo mới
	 * Sau đó cập nhật endpoint stream theo stream-id tương ứng
	 */
	private async ensurePipelineSetup(config: PipelineConfig): Promise<void> {
		// Nếu đã có endpoint trong cache, không cần làm gì
		if (this.endpointCache.has(config.schemaName)) {
			return;
		}

		// Kiểm tra endpoint từ config trước
		if (config.pipelineEndpoint) {
			this.endpointCache.set(config.schemaName, config.pipelineEndpoint);
			return;
		}

		// Nếu có API service, kiểm tra xem schema đã có pipeline chưa
		if (this.apiService) {
			// Đảm bảo pipeline tồn tại và lấy endpoint (tạo mới nếu cần)
			const endpoint = await this.apiService.ensurePipelineExists(config);
			if (endpoint) {
				// Lưu endpoint vào cache
				this.endpointCache.set(config.schemaName, endpoint);
				console.log(`Pipeline cho schema ${config.schemaName} đã sẵn sàng với endpoint: ${endpoint}`);
				return;
			}
			else {
				throw new Error(`Pipeline for schema ${config.schemaName} does not exist`);
			}
		}
	}

	/**
	 * Lấy số ngày retention. Ưu tiên KV config (admin), fallback env, mặc định 96
	 */
	private getRetentionDays(): number {
		if (this.d1tor2Config) {
			return Math.min(this.d1tor2Config.D1_RETENTION_DAYS, 365);
		}
		const envValue = (this.env as any).D1_RETENTION_DAYS;
		if (envValue !== undefined) {
			const days = parseInt(String(envValue), 10);
			if (!isNaN(days) && days > 0) {
				return Math.min(days, 365); // Cap 365 để tránh giá trị bất thường
			}
		}
		return 96;
	}

	/**
	 * Tìm ngày xa nhất có dữ liệu trong bảng, đảm bảo giữ lại N ngày gần nhất (N = D1_RETENTION_DAYS)
	 * @param tableName Tên bảng
	 * @returns Ngày xa nhất có dữ liệu (trước cutoff = N ngày trước), hoặc null nếu không tìm thấy
	 */
	private async findOldestDateWithData(tableName: string): Promise<Date | null> {
		try {
			const retentionDays = this.getRetentionDays();
			const now = new Date();

			// Tính cutoff date: N ngày trước (để giữ lại N ngày gần nhất)
			const cutoffDate = new Date(now);
			cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
			cutoffDate.setHours(0, 0, 0, 0);
			const cutoffTimestamp = Math.floor(cutoffDate.getTime());

			console.log(`  Cutoff date (${retentionDays} days ago): ${cutoffDate.toISOString().split('T')[0]}`);

			// Lấy created_at nhỏ nhất trong bảng, nhưng chỉ tìm các record trước cutoff
			// Dùng quoted identifiers để tương thích với queue-worker (columns: "globalId", "created_at", ...)
			const query = `SELECT MIN("created_at") as min_created_at FROM "${tableName}" WHERE "created_at" < ?`;
			const result = await this.db.prepare(query).bind(cutoffTimestamp).first();

			if (!result || !(result as any).min_created_at) {
				// Không có dữ liệu nào trước cutoff, đã đủ N ngày gần nhất
				console.log(`  No data before cutoff date, keeping ${retentionDays} most recent days`);
				return null;
			}

			const oldestTimestamp = (result as any).min_created_at;

			// Chuẩn hóa về đầu ngày
			const oldestDate = new Date(oldestTimestamp);
			oldestDate.setHours(0, 0, 0, 0);
			return oldestDate;
		} catch (error) {
			// Nếu bảng không tồn tại, trả về null
			if (error instanceof Error && error.message.includes('no such table')) {
				console.warn(`Table ${tableName} does not exist, skipping...`);
				return null;
			}
			throw error;
		}
	}

	/**
	 * Xử lý dữ liệu theo batch: query 10k từ D1 -> validate -> send vào R2 -> update flushedAt -> xoá bản ghi đã flushed -> lặp lại
	 * Tối ưu memory bằng cách không lưu tất cả records vào memory
	 * Xử lý song song nhiều batch để tăng hiệu suất
	 */
	private async processDataInBatches(config: PipelineConfig, targetDate: Date): Promise<number> {
		const batchSize = 10000; // Kích thước batch để tối ưu hiệu suất
		const concurrencyLimit = this.getConcurrencyLimit('batch');
		let totalProcessed = 0;
		let offset = 0;
		let hasMore = true;

		// Tính timestamp cho đầu và cuối ngày đích
		const endOfDay = new Date(targetDate);
		endOfDay.setHours(23, 59, 59, 999);

		const endTimestamp = Math.floor(endOfDay.getTime());

		console.log(`  Processing data from ${config.tableName} for date ${targetDate.toISOString().split('T')[0]} (<= ${endTimestamp})...`);

		try {
			// Queue để quản lý các batch đang được xử lý (map promise với batch info)
			const processingQueue: Array<{ promise: Promise<number>; offset: number }> = [];

			while (hasMore || processingQueue.length > 0) {
				// Query batch tiếp theo nếu còn data và chưa đạt giới hạn concurrency
				while (hasMore && processingQueue.length < concurrencyLimit) {
					// Query batch từ D1 - quoted identifiers tương thích queue-worker
					// Chỉ dùng endTimestamp (không dùng startTimestamp) để ngày T+1 vẫn xử lý được nếu ngày T chưa đẩy xong
					const query = `SELECT * FROM "${config.tableName}" WHERE "created_at" <= ? ORDER BY "globalId" ASC LIMIT ${batchSize} OFFSET ${offset}`;
					const result = await this.db.prepare(query).bind(endTimestamp).all();

					if (!result.results || result.results.length === 0) {
						hasMore = false;
						break;
					}

					const batch = result.results as any[];
					
					if (batch.length === 0) {
						hasMore = false;
						break;
					}

					const currentOffset = offset;
					const batchLength = batch.length;

					// Tạo promise để xử lý batch này song song
					const processPromise = this.processBatch(config, batch, currentOffset)
						.then((processed) => {
							console.log(`  Completed batch at offset ${currentOffset}: ${batchLength} records`);
							return processed;
						})
						.catch((error) => {
							console.error(`  Failed to process batch at offset ${currentOffset}:`, error);
							throw error;
						});

					processingQueue.push({ promise: processPromise, offset: currentOffset });
					offset += batch.length;

					// Nếu số bản ghi trả về ít hơn batchSize, đã lấy hết dữ liệu
					if (batch.length < batchSize) {
						hasMore = false;
					}
				}

				// Chờ một batch hoàn thành trước khi query batch tiếp theo
				if (processingQueue.length > 0) {
					// Wrap mỗi promise với index để biết promise nào hoàn thành
					const promisesWithIndex = processingQueue.map((item, index) => 
						item.promise
							.then(value => ({ status: 'fulfilled' as const, value, index }))
							.catch(reason => ({ status: 'rejected' as const, reason, index }))
					);
					
					// Chờ batch đầu tiên hoàn thành
					const completed = await Promise.race(promisesWithIndex);
					
					if (completed.status === 'fulfilled') {
						totalProcessed += completed.value;
					} else {
						// Nếu batch failed, throw error
						throw completed.reason;
					}
					
					// Xóa batch đã hoàn thành khỏi queue
					processingQueue.splice(completed.index, 1);
				}
			}

			// Xóa các bản ghi đã được update flushedAt (đã flush lên R2 thành công)
			// Chỉ dùng endTimestamp (không dùng startTimestamp) để ngày T+1 vẫn xử lý được nếu ngày T chưa đẩy xong
			await this.deleteFlushedRecordsFromD1(config.tableName, endTimestamp);

			console.log(`  Total records processed: ${totalProcessed}`);
			return totalProcessed;
		} catch (error) {
			// Nếu bảng không tồn tại, trả về 0
			if (error instanceof Error && error.message.includes('no such table')) {
				console.warn(`Table ${config.tableName} does not exist, skipping...`);
				return 0;
			}
			throw error;
		}
	}

	/**
	 * Xử lý một batch: validate -> send vào R2 -> update flushedAt trong D1 (đánh dấu xoá sau)
	 */
	private async processBatch(
		config: PipelineConfig,
		batch: any[],               // Có thể thay bằng type cụ thể nếu bạn có
		offset: number
	  ): Promise<number> {
		const batchSize = batch.length;
	  
		console.log(`Processing batch at offset ${offset}: ${batchSize} records...`);
	  
		// 1. Nếu batch rỗng → không làm gì cả, trả về sớm
		if (batchSize === 0) {
		  console.log('Batch is empty, skipping processing.');
		  return 0;
		}
	  
		let recordIds: number[] = []; 
	  
		try {
		// 2. Lấy danh sách ID để update flushedAt sau (chỉ lấy những record có id hợp lệ)
		  recordIds = batch
			.map((record: any) => record.globalId);
	  
		  console.log(`Found ${recordIds.length} valid record IDs for flushedAt update.`);
	  
		  // 3. Validate và transform dữ liệu theo Zod schema
		  const validatedRecords = this.validateRecords(batch, config.schema);
	  
		  // Kiểm tra lại sau validate: nếu không còn record nào hợp lệ
		  if (validatedRecords.length != batchSize) {
			throw new Error(`Invalid records: ${validatedRecords.length} of ${batchSize} records failed validation.`);
		  } else {
			console.log(`Sending ${validatedRecords.length} validated records to pipeline ${config.schemaName}...`);	  
			// 4. Gửi đến Cloudflare Pipeline (sẽ throw error nếu fail)
			const sentSuccessfully = await this.sendToPipeline(config, validatedRecords);
			if (!sentSuccessfully) {
				throw new Error(`Failed to send data to pipeline ${config.schemaName}.`);
			}
			console.log('Successfully sent data to pipeline.');
			await this.updateBatchFromD1(config.tableName, recordIds);
			console.log(`Updated flushedAt for ${recordIds.length} records in D1.`);

		  }
	  
		  return batchSize;
		} catch (error: any) {
		// 6. Quan trọng: Nếu gửi pipeline thất bại → KHÔNG update flushedAt (data giữ nguyên)
		  //     Để lần sync sau sẽ thử lại
		  console.error(
			`Failed to process batch at offset ${offset}. Data will NOT be updated in D1 to allow retry.`,
			error
		  );
	  
		  // Có thể re-throw để caller biết batch này fail (tùy cách bạn handle lỗi tổng thể)
		  throw error;
		}
	}

	/**
	 * Cập nhật flushedAt cho batch records trong D1 (đánh dấu đã flush lên R2, để xoá sau)
	 */
	private async updateBatchFromD1(tableName: string, recordIds: number[]): Promise<void> {
		try {
			const flushedAt = Math.floor(Date.now());
			const placeholders = recordIds.map(() => '?').join(',');
			const query = `UPDATE "${tableName}" SET "flushedAt" = ? WHERE "globalId" IN (${placeholders})`;
			const params = [flushedAt, ...recordIds];

			await this.db.prepare(query).bind(...params).run();
			console.log(`  Updated flushedAt for ${recordIds.length} records in ${tableName}`);
		} catch (error) {
			console.error(`Failed to update batch in D1: ${error}, tableName: ${tableName}, recordIds: ${recordIds.join(',')}`);
			throw error;
		}
	}

	/**
	 * Xóa các bản ghi đã được update flushedAt (đã flush lên R2 thành công)
	 */
	private async deleteFlushedRecordsFromD1(tableName: string, endTimestamp: number): Promise<number> {
		try {
			const query = `DELETE FROM "${tableName}" WHERE "created_at" <= ? AND "flushedAt" IS NOT NULL`;
			const result = await this.db.prepare(query).bind(endTimestamp).run();
			const deleted = result.meta?.changes ?? 0;
			if (deleted > 0) {
				console.log(`  Deleted ${deleted} flushed records from ${tableName}`);
			}
			return deleted;
		} catch (error) {
			console.error(`Failed to delete flushed records from D1: ${error}, tableName: ${tableName}`);
			throw error;
		}
	}

	/**
	 * Gửi dữ liệu đến Cloudflare Pipeline HTTP endpoint
	 * Pipeline sẽ xử lý và lưu data vào R2 Data Catalog dưới dạng Apache Iceberg table
	 * 
	 * Reference: https://developers.cloudflare.com/pipelines/getting-started/
	 * 
	 * Format: POST https://{stream-id}.ingest.cloudflare.com
	 * Body: JSON array of records
	 */
	private async sendToPipeline(config: PipelineConfig, records: any[]): Promise<boolean> {
		// Lấy pipeline endpoint từ cache, config hoặc environment variable
		let endpoint = this.endpointCache.get(config.schemaName) || config.pipelineEndpoint;
		
		if (!endpoint) {
			// Try to get from environment variables
			const envKey = `PIPELINE_${config.schemaName.toUpperCase()}_ENDPOINT`;
			// Access env vars safely - they should be defined in wrangler.jsonc vars section
			const envValue = (this.env as any)[envKey];
			if (typeof envValue === 'string') {
				endpoint = envValue;
				this.endpointCache.set(config.schemaName, endpoint);
			}
		}

		if (!endpoint) {
			throw new Error(
				`Pipeline endpoint not configured for ${config.schemaName}. ` +
				`Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to auto-create pipelines, ` +
				`or set PIPELINE_${config.schemaName.toUpperCase()}_ENDPOINT environment variable ` +
				`or configure pipelineEndpoint in config. ` +
				`You can get the endpoint URL after creating the pipeline via: ` +
				`npx wrangler pipelines setup or from the Cloudflare Dashboard.`
			);
		}

		// Validate endpoint URL format
		if (!endpoint.startsWith('https://') || !endpoint.includes('.ingest.cloudflare.com')) {
			throw new Error(`Invalid pipeline endpoint format: ${endpoint}. Expected format: https://{stream-id}.ingest.cloudflare.com`);
		}

		// Gửi data đến pipeline endpoint
		// Pipeline sẽ tự động xử lý và lưu vào R2 Data Catalog
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(records),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			throw new Error(
				`Failed to send data to pipeline ${config.schemaName}: ` +
				`${response.status} ${response.statusText}. ${errorText}` + 
				`Endpoint: ${endpoint}; ` +
				`Records: ${JSON.stringify(records)}`				
			);
		}

		console.log(`  Sent ${records.length} records to pipeline ${config.schemaName} (endpoint: ${endpoint})`);

		return true
	}

	/**
	 * Chuẩn hóa row từ D1: chuyển null -> undefined (giống queue-worker parseFromDatabase)
	 * D1 trả về NULL dưới dạng JavaScript null, schema dùng .optional()/.nullish()
	 */
	private normalizeD1Row(row: any): any {
		if (!row || typeof row !== 'object') return row;
		const normalized: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(row)) {
			normalized[k] = v === null ? undefined : v;
		}
		return normalized;
	}

	/**
	 * Validate records với Zod schema
	 * Đảm bảo data đúng format trước khi gửi đến pipeline
	 * Normalize D1 rows (null -> undefined) để tương thích với schema
	 */
	private validateRecords(records: any[], schema: z.ZodSchema): any[] {
		const validatedRecords: any[] = [];
		const errors: string[] = [];

		for (let i = 0; i < records.length; i++) {
			const raw = records[i];
			const normalized = this.normalizeD1Row(raw);
			const parsed = parseD1JsonFields(normalized, schema);
			const result = schema.safeParse(parsed);
			if (result.success) {
				validatedRecords.push(result.data);
			} else {
				const errDetails = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
				errors.push(`Record ${i}: ${errDetails}`);

				// Debug: log raw/normalized data và chi tiết Zod error cho record lỗi
				console.warn(`[validateRecords] Record ${i} FAILED - raw:`, JSON.stringify(raw, null, 0));
				console.warn(`[validateRecords] Record ${i} FAILED - normalized:`, JSON.stringify(normalized, null, 0));
				console.warn(
					`[validateRecords] Record ${i} FAILED - Zod issues:`,
					result.error.errors.map((e) => ({ path: e.path, message: e.message, code: e.code })),
				);
			}
		}

		if (errors.length > 0) {
			console.warn(`Validation warnings for ${errors.length} records:`, errors.slice(0, 5));
			if (errors.length > 5) {
				console.warn(`... and ${errors.length - 5} more validation errors`);
			}
		}

		return validatedRecords;
	}

	/**
	 * Chạy một pipeline cụ thể theo tên schema
	 * @param schemaName Tên schema
	 */
	async runPipelineByName(schemaName: string): Promise<PipelineResult> {
		const config = PIPELINE_CONFIGS.find((c) => c.schemaName === schemaName);
		if (!config) {
			throw new Error(`Pipeline config not found for schema: ${schemaName}`);
		}
		return this.runPipeline(config);
	}
}

