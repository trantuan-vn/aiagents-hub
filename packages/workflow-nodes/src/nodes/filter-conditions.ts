import { interpolate } from "../expression/interpolate";

export type FilterCombinator = "and" | "or";

export type FilterOperatorType =
  | "string"
  | "number"
  | "dateTime"
  | "boolean"
  | "array"
  | "object";

export type FilterOperator = {
  type: FilterOperatorType;
  operation: string;
  singleValue?: boolean;
};

export type FilterCondition = {
  id: string;
  leftValue: unknown;
  rightValue: unknown;
  operator: FilterOperator;
};

export type FilterValue = {
  combinator: FilterCombinator;
  conditions: FilterCondition[];
  options?: {
    caseSensitive?: boolean;
    leftValue?: string;
    typeValidation?: "strict" | "loose";
    version?: number;
  };
};

export type FilterNodeOptions = {
  ignoreCase?: boolean;
};

const SINGLE_VALUE_OPS = new Set([
  "exists",
  "notExists",
  "empty",
  "notEmpty",
  "true",
  "false",
]);

export function isSingleValueOperation(operation: string): boolean {
  return SINGLE_VALUE_OPS.has(operation);
}

let filterConditionSeq = 0;

/** Unique id for extra conditions. Avoids Workers global-scope crypto/random bans. */
export function newFilterConditionId(): string {
  filterConditionSeq += 1;
  return `cond_${filterConditionSeq}`;
}

export function defaultFilterCondition(): FilterCondition {
  return {
    id: "condition",
    leftValue: "",
    rightValue: "",
    operator: { type: "string", operation: "equals" },
  };
}

export function defaultFilterValue(): FilterValue {
  return {
    combinator: "and",
    conditions: [defaultFilterCondition()],
    options: {
      caseSensitive: true,
      leftValue: "",
      typeValidation: "strict",
      version: 2,
    },
  };
}

/** Default `node.data` fields for Filter (flow + transform). */
export function defaultFilterNodeData(): Record<string, unknown> {
  return {
    conditions: defaultFilterValue(),
    looseTypeValidation: false,
    options: {},
  };
}

export function parseFilterValue(raw: unknown): FilterValue | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const conditions = Array.isArray(value.conditions) ? value.conditions : undefined;
  if (!conditions) return undefined;
  return {
    combinator: value.combinator === "or" ? "or" : "and",
    conditions: conditions.map(normalizeCondition),
    options:
      value.options && typeof value.options === "object"
        ? (value.options as FilterValue["options"])
        : undefined,
  };
}

function normalizeCondition(raw: unknown): FilterCondition {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const operatorRaw = row.operator && typeof row.operator === "object" ? (row.operator as Record<string, unknown>) : {};
  const type = isOperatorType(operatorRaw.type) ? operatorRaw.type : "string";
  const operation = typeof operatorRaw.operation === "string" ? operatorRaw.operation : "equals";
  return {
    id: typeof row.id === "string" && row.id ? row.id : newFilterConditionId(),
    leftValue: row.leftValue ?? "",
    rightValue: row.rightValue ?? "",
    operator: {
      type,
      operation,
      singleValue: operatorRaw.singleValue === true || isSingleValueOperation(operation),
    },
  };
}

function isOperatorType(value: unknown): value is FilterOperatorType {
  return (
    value === "string" ||
    value === "number" ||
    value === "dateTime" ||
    value === "boolean" ||
    value === "array" ||
    value === "object"
  );
}

function resolveOperand(raw: unknown, scope: Record<string, unknown>): unknown {
  if (typeof raw !== "string") return raw;
  if (!raw.includes("{{")) return raw;
  try {
    return interpolate(raw, { ...scope, $json: scope.$json ?? scope });
  } catch {
    return raw;
  }
}

function existsValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function isEmptyValue(value: unknown): boolean {
  if (!existsValue(value)) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function asString(value: unknown, caseSensitive: boolean): string {
  const text = value == null ? "" : String(value);
  return caseSensitive ? text : text.toLowerCase();
}

function asNumber(value: unknown, loose: boolean): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!loose) return undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asBoolean(value: unknown, loose: boolean): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (!loose) return undefined;
  if (value === 1 || value === "1" || value === "true" || value === "TRUE") return true;
  if (value === 0 || value === "0" || value === "false" || value === "FALSE" || value === "") return false;
  return Boolean(value);
}

function asDateMs(value: unknown, loose: boolean): number | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!loose && typeof value !== "string") return undefined;
  if (value == null || value === "") return undefined;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? undefined : ms;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function compareCondition(
  condition: FilterCondition,
  scope: Record<string, unknown>,
  caseSensitive: boolean,
  loose: boolean,
): boolean {
  const left = resolveOperand(condition.leftValue, scope);
  const right = resolveOperand(condition.rightValue, scope);
  const op = condition.operator.operation;
  const type = condition.operator.type;

  if (op === "exists") return existsValue(left);
  if (op === "notExists") return !existsValue(left);
  if (op === "empty") return isEmptyValue(left);
  if (op === "notEmpty") return !isEmptyValue(left);

  if (type === "boolean") {
    if (op === "true") return asBoolean(left, true) === true;
    if (op === "false") return asBoolean(left, true) === false;
    const l = asBoolean(left, loose);
    const r = asBoolean(right, loose);
    if (l == null || r == null) return false;
    if (op === "equals") return l === r;
    if (op === "notEquals") return l !== r;
    return false;
  }

  if (type === "number") {
    const l = asNumber(left, loose);
    const r = asNumber(right, loose);
    if (op === "equals") return l != null && r != null && l === r;
    if (op === "notEquals") return l !== r;
    if (l == null || r == null) return false;
    if (op === "gt") return l > r;
    if (op === "lt") return l < r;
    if (op === "gte") return l >= r;
    if (op === "lte") return l <= r;
    return false;
  }

  if (type === "dateTime") {
    const l = asDateMs(left, loose);
    const r = asDateMs(right, loose);
    if (op === "equals") return l != null && r != null && l === r;
    if (op === "notEquals") return l !== r;
    if (l == null || r == null) return false;
    if (op === "after") return l > r;
    if (op === "before") return l < r;
    if (op === "afterOrEquals") return l >= r;
    if (op === "beforeOrEquals") return l <= r;
    return false;
  }

  if (type === "array") {
    const l = asArray(left);
    if (op === "contains") return l ? l.map((v) => asString(v, caseSensitive)).includes(asString(right, caseSensitive)) : false;
    if (op === "notContains") return l ? !l.map((v) => asString(v, caseSensitive)).includes(asString(right, caseSensitive)) : true;
    const len = l?.length ?? 0;
    const n = asNumber(right, true) ?? 0;
    if (op === "lengthEquals") return len === n;
    if (op === "lengthNotEquals") return len !== n;
    if (op === "lengthGt") return len > n;
    if (op === "lengthLt") return len < n;
    if (op === "lengthGte") return len >= n;
    if (op === "lengthLte") return len <= n;
    return false;
  }

  if (type === "object") {
    return false;
  }

  const l = asString(left, caseSensitive);
  const r = asString(right, caseSensitive);
  if (op === "equals") return l === r;
  if (op === "notEquals") return l !== r;
  if (op === "contains") return l.includes(r);
  if (op === "notContains") return !l.includes(r);
  if (op === "startsWith") return l.startsWith(r);
  if (op === "notStartsWith") return !l.startsWith(r);
  if (op === "endsWith") return l.endsWith(r);
  if (op === "notEndsWith") return !l.endsWith(r);
  if (op === "regex" || op === "notRegex") {
    try {
      const ok = new RegExp(String(right ?? "")).test(String(left ?? ""));
      return op === "regex" ? ok : !ok;
    } catch {
      return false;
    }
  }
  return false;
}

export function evaluateFilterValue(
  filter: FilterValue,
  scope: Record<string, unknown>,
  opts?: { ignoreCase?: boolean; looseTypeValidation?: boolean },
): boolean {
  const conditions = filter.conditions ?? [];
  if (conditions.length === 0) return false;
  const ignoreCase = opts?.ignoreCase === true;
  const loose = opts?.looseTypeValidation === true;
  const results = conditions.map((condition) => compareCondition(condition, scope, !ignoreCase, loose));
  return filter.combinator === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** True when node data has a structured Filter conditions object. */
export function evaluateFilterFromNodeData(
  data: Record<string, unknown>,
  scope: Record<string, unknown>,
): boolean | undefined {
  const parsed = parseFilterValue(data.conditions);
  if (!parsed) return undefined;
  const options = (data.options && typeof data.options === "object" ? data.options : {}) as FilterNodeOptions;
  return evaluateFilterValue(parsed, scope, {
    ignoreCase: options.ignoreCase === true,
    looseTypeValidation: data.looseTypeValidation === true,
  });
}
