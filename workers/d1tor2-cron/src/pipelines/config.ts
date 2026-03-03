import {
	OrderSchema,
	ServiceUsageSchema,
	OrderItemSchema,
	OrderItemDiscountSchema,
	PaymentSchema,
	RefundSchema,
} from '@auth-worker/features/ws/domain.js';
import { z } from 'zod';

// Utility function to check schema type without instanceof issues
const getSchemaTypeName = (schema: any): string => {
	return schema?.constructor?.name || 'Unknown';
};

const isZodObject = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodObject';
};

const isZodOptional = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodOptional';
};

const isZodDefault = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodDefault';
};

const isZodString = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodString';
};

const isZodNumber = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodNumber';
};

const isZodBoolean = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodBoolean';
};

const isZodDate = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodDate';
};

const isZodEffects = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodEffects';
};

const isZodNullable = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodNullable';
};

const isZodArray = (schema: any): boolean => {
	return getSchemaTypeName(schema) === 'ZodArray';
};

/**
 * Pipeline field definition theo format Cloudflare Pipelines
 * https://developers.cloudflare.com/pipelines/getting-started/
 */
export interface PipelineField {
	name: string;
	type: 'string' | 'int64' | 'float64' | 'bool' | 'timestamp';
	required: boolean;
}

/**
 * Pipeline schema definition theo format Cloudflare Pipelines
 */
export interface PipelineSchema {
	fields: PipelineField[];
}

/**
 * Pipeline configuration cho từng schema
 * Mỗi schema tương ứng với 1 pipeline sẽ sync data từ D1 sang R2 Data Catalog (Apache Iceberg)
 */
export interface PipelineConfig {
	schemaName: string;
	tableName: string;
	schema: z.ZodSchema; // Zod schema để validate
	pipelineSchema: PipelineSchema; // Pipeline schema format cho Cloudflare Pipelines
	pipelineEndpoint?: string; // HTTP endpoint URL của pipeline (ví dụ: https://{stream-id}.ingest.cloudflare.com)
	namespace: string; // Namespace trong R2 Data Catalog (thường là 'default')
	r2BucketName: string; // Tên R2 bucket
}

/**
 * Unwrap Zod type để lấy inner type từ các wrapper types (Optional, Nullable, Default, Effects, etc.)
 * Logic tương tự như trong queue-worker/src/database/index.ts
 */
function unwrapZodType(zodType: z.ZodTypeAny): z.ZodTypeAny {
	const typeName = getSchemaTypeName(zodType);
	const def = (zodType as any)._def;

	if (typeName === 'ZodEffects') {
		if (def.schema) {
			return unwrapZodType(def.schema);
		}
		if (def.innerType) {
			return unwrapZodType(def.innerType);
		}
	}

	if (typeName === 'ZodOptional' ||
		typeName === 'ZodNullable' ||
		typeName === 'ZodDefault' ||
		typeName === 'ZodBranded' ||
		typeName === 'ZodReadonly' ||
		typeName === 'ZodCatch' ||
		typeName === 'ZodPromise') {

		if (def.innerType) {
			return unwrapZodType(def.innerType);
		}
		if (def.valueType) {
			return unwrapZodType(def.valueType);
		}
		if (def.type) {
			return unwrapZodType(def.type);
		}
	}

	if (typeName === 'ZodLazy' && def.getter) {
		try {
			return unwrapZodType(def.getter());
		} catch {
			return z.string();
		}
	}

	if (typeName === 'ZodPipeline' && def.in) {
		return unwrapZodType(def.in);
	}

	if (typeName === 'ZodUnion') {
		const options = def.options as z.ZodTypeAny[];
		const unwrappedTypes = options.map(opt => unwrapZodType(opt));

		const booleanType = unwrappedTypes.find(t => getSchemaTypeName(t) === 'ZodBoolean');
		if (booleanType) return booleanType;

		const numberType = unwrappedTypes.find(t => getSchemaTypeName(t) === 'ZodNumber');
		if (numberType) return numberType;

		const stringType = unwrappedTypes.find(t => getSchemaTypeName(t) === 'ZodString');
		if (stringType) return stringType;

		const recordType = unwrappedTypes.find(t => getSchemaTypeName(t) === 'ZodRecord');
		if (recordType) return recordType;

		const arrayType = unwrappedTypes.find(t => getSchemaTypeName(t) === 'ZodArray');
		if (arrayType) return arrayType;

		const objectType = unwrappedTypes.find(t => getSchemaTypeName(t) === 'ZodObject');
		if (objectType) return objectType;

		return unwrappedTypes[0] || z.string();
	}

	if (typeName === 'ZodIntersection') {
		const left = unwrapZodType(def.left);
		const right = unwrapZodType(def.right);

		if (getSchemaTypeName(left) === 'ZodBoolean' || getSchemaTypeName(right) === 'ZodBoolean') {
			return z.boolean();
		}
		if (getSchemaTypeName(left) === 'ZodNumber' || getSchemaTypeName(right) === 'ZodNumber') {
			return z.number();
		}
		if (getSchemaTypeName(left) === 'ZodString' || getSchemaTypeName(right) === 'ZodString') {
			return z.string();
		}
		if (getSchemaTypeName(left) === 'ZodRecord' || getSchemaTypeName(right) === 'ZodRecord') {
			return z.record(z.string(), z.any());
		}
		if (getSchemaTypeName(left) === 'ZodArray' || getSchemaTypeName(right) === 'ZodArray') {
			return z.array(z.any());
		}
		if (getSchemaTypeName(left) === 'ZodObject' || getSchemaTypeName(right) === 'ZodObject') {
			return z.object({});
		}

		return left;
	}

	if (typeName === 'ZodDiscriminatedUnion') {
		const allTypes: z.ZodTypeAny[] = [];
		for (const options of def.options.values()) {
			options.forEach((opt: z.ZodTypeAny) =>
				allTypes.push(unwrapZodType(opt))
			);
		}

		const booleanType = allTypes.find(t => getSchemaTypeName(t) === 'ZodBoolean');
		if (booleanType) return booleanType;

		const numberType = allTypes.find(t => getSchemaTypeName(t) === 'ZodNumber');
		if (numberType) return numberType;

		const stringType = allTypes.find(t => getSchemaTypeName(t) === 'ZodString');
		if (stringType) return stringType;

		const recordType = allTypes.find(t => getSchemaTypeName(t) === 'ZodRecord');
		if (recordType) return recordType;

		const arrayType = allTypes.find(t => getSchemaTypeName(t) === 'ZodArray');
		if (arrayType) return arrayType;

		const objectType = allTypes.find(t => getSchemaTypeName(t) === 'ZodObject');
		if (objectType) return objectType;

		return allTypes[0] || z.string();
	}

	return zodType;
}

/**
 * Kiểm tra xem ZodNumber có phải là integer type không
 */
function isIntegerType(zodNumber: z.ZodNumber): boolean {
	const checks = (zodNumber as any)._def.checks || [];
	return checks.some((check: any) => check.kind === 'int');
}

/**
 * Map Zod type sang Cloudflare Pipelines type
 * Logic tương tự getColumnType trong queue-worker nhưng map sang Pipeline format
 */
function getPipelineType(zodType: z.ZodTypeAny, fieldName?: string): PipelineField['type'] {
	const unwrappedType = unwrapZodType(zodType);
	const typeName = getSchemaTypeName(unwrappedType);

	// Map to Cloudflare Pipelines types
	if (typeName === 'ZodString') {
		return 'string';
	} else if (typeName === 'ZodNumber') {
		return isIntegerType(unwrappedType as z.ZodNumber) ? 'int64' : 'float64';
	} else if (typeName === 'ZodBoolean') {
		return 'bool';
	} else if (typeName === 'ZodDate') {
		return 'timestamp';
	} else if (typeName === 'ZodBigInt') {
		return 'int64';
	} else if (typeName === 'ZodEnum') {
		return 'string';
	} else if (typeName === 'ZodNativeEnum') {
		return 'string';
	} else if (typeName === 'ZodLiteral') {
		const value = (unwrappedType as any)._def.value;
		if (typeof value === 'boolean') {
			return 'bool';
		} else if (typeof value === 'number') {
			return Number.isInteger(value) ? 'int64' : 'float64';
		} else {
			return 'string';
		}
	} else if (typeName === 'ZodRecord' ||
		typeName === 'ZodMap' ||
		typeName === 'ZodArray' ||
		typeName === 'ZodTuple' ||
		typeName === 'ZodObject') {
		// Complex types được lưu dưới dạng JSON string
		return 'string';
	} else if (fieldName && (
		fieldName.toLowerCase().includes('time') ||
		fieldName.toLowerCase().includes('at') ||
		fieldName.toLowerCase().endsWith('_at')
	)) {
		// Heuristic cho timestamp fields
		return 'timestamp';
	} else {
		// Default fallback
		return 'string';
	}
}

/**
 * Helper function để tạo pipeline schema từ Zod schema
 * Chuyển đổi các field types từ Zod sang Cloudflare Pipelines format
 */
function createPipelineSchemaFromZod(zodSchema: z.ZodSchema): PipelineSchema {
	// Lấy shape từ Zod object schema
	if (!isZodObject(zodSchema)) {
		// Fallback: return empty schema nếu không phải ZodObject
		return { fields: [] };
	}

	const shape = (zodSchema as any).shape;
	const fields: PipelineField[] = [];

	for (const [key, value] of Object.entries(shape)) {
		let required = true;
		let zodType: z.ZodTypeAny = value as z.ZodTypeAny;

		// Handle optional, nullable, và default
		if (isZodOptional(zodType)) {
			required = false;
			zodType = (zodType as any)._def.innerType;
		} else if (isZodDefault(zodType)) {
			required = false;
			zodType = (zodType as any)._def.innerType;
		} else if (isZodNullable(zodType)) {
			required = false;
			zodType = (zodType as any)._def.innerType;
		}

		// Sử dụng getPipelineType để map type (tương tự getColumnType trong queue-worker)
		const type = getPipelineType(zodType, key);

		fields.push({ name: key, type, required });
	}

	return { fields };
}

/**
 * Export pipeline schema as JSON format for use with `wrangler pipelines setup`
 * Có thể sử dụng function này để generate schema files khi setup pipelines
 */
export function exportPipelineSchemaAsJSON(config: PipelineConfig): string {
	return JSON.stringify(config.pipelineSchema, null, 2);
}

/**
 * Parse/chuẩn hóa các cột từ D1 về đúng type trước khi validate.
 * D1/SQLite và queue-worker serialize khác JS: boolean->0/1, array/object->JSON string.
 * Tham chiếu: queue-worker parseFromDatabase, preprocessData.
 */
export function parseD1JsonFields(row: any, schema: z.ZodSchema): any {
	if (!row || typeof row !== 'object') return row;
	const shape = isZodObject(schema) ? (schema as any).shape : {};
	const result = { ...row };

	for (const [key, value] of Object.entries(result)) {
		const fieldSchema = shape[key];
		if (!fieldSchema) continue;

		const unwrapped = unwrapZodType(fieldSchema);
		const typeName = getSchemaTypeName(unwrapped);

		// Boolean: D1/SQLite lưu 0/1, schema mong boolean
		if (typeName === 'ZodBoolean') {
			if (value === 1 || value === '1' || value === 'true') {
				result[key] = true;
			} else if (value === 0 || value === '0' || value === 'false') {
				result[key] = false;
			}
			continue;
		}

		// Number: D1 đôi khi trả string (INTEGER), schema mong number
		if (typeName === 'ZodNumber' && typeof value === 'string') {
			const num = Number(value);
			if (!isNaN(num)) result[key] = num;
			continue;
		}

		// Array, Object, Record: lưu dưới dạng JSON string
		if (typeName === 'ZodArray' || typeName === 'ZodObject' || typeName === 'ZodRecord' || typeName === 'ZodTuple') {
			if (typeof value !== 'string') continue;
			try {
				const parsed = JSON.parse(value);
				if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
					result[key] = parsed;
				}
			} catch {
				// Giữ nguyên string nếu parse thất bại
			}
			continue;
		}

		// Map: lưu dạng JSON string của object
		if (typeName === 'ZodMap' && typeof value === 'string') {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					result[key] = new Map(Object.entries(parsed));
				}
			} catch {
				// Giữ nguyên
			}
		}
	}
	return result;
}

/**
 * Tạo extended schema tương thích với D1 tables trong queue-worker
 * Queue worker's D1DatabaseManager.createExtendedSchema thêm các cột:
 * - globalId, id, created_at, updated_at, user_id, organization_id
 * - queueId, queueStatus, flushedAt, processedAt (queue flow)
 *
 * Dùng .nullish() cho các cột có thể NULL trong D1 khi đọc (id, organization_id,
 * queueId, queueStatus, flushedAt, processedAt)
 */
function createExtendedSchema(schema: z.ZodSchema): z.ZodSchema {
	return (schema as any).extend({
		globalId: z.number().int().optional(),
		id: z.number().int().nullish(),
		created_at: z.number().optional(),
		updated_at: z.number().optional(),
		user_id: z.string().optional(),
		organization_id: z.string().nullish(),
		queueId: z.number().int().nullish(),
		queueStatus: z.enum(['pending', 'flushed', 'processed']).nullish(),
		flushedAt: z.number().nullish(),
		processedAt: z.number().nullish(),
	});
}
/**
 * Pipeline configurations - chỉ xử lý các bảng: service_usages, orders, order_items, order_discounts, payments, refunds
 * Tham chiếu: workers/queue-worker/src/database/index.ts -> initializeTables()
 */
export const PIPELINE_CONFIGS: PipelineConfig[] = [
	{
		schemaName: 'ServiceUsageSchema',
		tableName: 'service_usages',
		schema: createExtendedSchema(ServiceUsageSchema),
		pipelineSchema: createPipelineSchemaFromZod(createExtendedSchema(ServiceUsageSchema)),
		namespace: 'v011',
		r2BucketName: 'lakehouse',
	},
	{
		schemaName: 'OrderSchema',
		tableName: 'orders',
		schema: createExtendedSchema(OrderSchema),
		pipelineSchema: createPipelineSchemaFromZod(createExtendedSchema(OrderSchema)),
		namespace: 'v011',
		r2BucketName: 'lakehouse',
	},
	{
		schemaName: 'OrderItemSchema',
		tableName: 'order_items',
		schema: createExtendedSchema(OrderItemSchema),
		pipelineSchema: createPipelineSchemaFromZod(createExtendedSchema(OrderItemSchema)),
		namespace: 'v011',
		r2BucketName: 'lakehouse',
	},
	{
		schemaName: 'OrderItemDiscountSchema',
		tableName: 'order_discounts',
		schema: createExtendedSchema(OrderItemDiscountSchema),
		pipelineSchema: createPipelineSchemaFromZod(createExtendedSchema(OrderItemDiscountSchema)),
		namespace: 'v011',
		r2BucketName: 'lakehouse',
	},
	{
		schemaName: 'PaymentSchema',
		tableName: 'payments',
		schema: createExtendedSchema(PaymentSchema),
		pipelineSchema: createPipelineSchemaFromZod(createExtendedSchema(PaymentSchema)),
		namespace: 'v011',
		r2BucketName: 'lakehouse',
	},
	{
		schemaName: 'RefundSchema',
		tableName: 'refunds',
		schema: createExtendedSchema(RefundSchema),
		pipelineSchema: createPipelineSchemaFromZod(createExtendedSchema(RefundSchema)),
		namespace: 'v011',
		r2BucketName: 'lakehouse',
	},
];

