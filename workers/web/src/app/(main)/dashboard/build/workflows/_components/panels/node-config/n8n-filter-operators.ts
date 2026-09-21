import type { FilterOperatorType } from "@aiagents-hub/workflow-nodes";

export type FilterOperatorChoice = {
  type: FilterOperatorType;
  operation: string;
  label: string;
  singleValue?: boolean;
};

export const FILTER_OPERATOR_GROUPS: {
  type: FilterOperatorType;
  label: string;
  badge: string;
  ops: FilterOperatorChoice[];
}[] = [
  {
    type: "string",
    label: "String",
    badge: "T",
    ops: [
      { type: "string", operation: "exists", label: "exists", singleValue: true },
      { type: "string", operation: "notExists", label: "does not exist", singleValue: true },
      { type: "string", operation: "empty", label: "is empty", singleValue: true },
      { type: "string", operation: "notEmpty", label: "is not empty", singleValue: true },
      { type: "string", operation: "equals", label: "is equal to" },
      { type: "string", operation: "notEquals", label: "is not equal to" },
      { type: "string", operation: "contains", label: "contains" },
      { type: "string", operation: "notContains", label: "does not contain" },
      { type: "string", operation: "startsWith", label: "starts with" },
      { type: "string", operation: "notStartsWith", label: "does not start with" },
      { type: "string", operation: "endsWith", label: "ends with" },
      { type: "string", operation: "notEndsWith", label: "does not end with" },
      { type: "string", operation: "regex", label: "matches regex" },
      { type: "string", operation: "notRegex", label: "does not match regex" },
    ],
  },
  {
    type: "number",
    label: "Number",
    badge: "#",
    ops: [
      { type: "number", operation: "exists", label: "exists", singleValue: true },
      { type: "number", operation: "notExists", label: "does not exist", singleValue: true },
      { type: "number", operation: "empty", label: "is empty", singleValue: true },
      { type: "number", operation: "notEmpty", label: "is not empty", singleValue: true },
      { type: "number", operation: "equals", label: "is equal to" },
      { type: "number", operation: "notEquals", label: "is not equal to" },
      { type: "number", operation: "gt", label: "is greater than" },
      { type: "number", operation: "lt", label: "is less than" },
      { type: "number", operation: "gte", label: "is greater than or equal to" },
      { type: "number", operation: "lte", label: "is less than or equal to" },
    ],
  },
  {
    type: "dateTime",
    label: "Date & Time",
    badge: "⏱",
    ops: [
      { type: "dateTime", operation: "exists", label: "exists", singleValue: true },
      { type: "dateTime", operation: "notExists", label: "does not exist", singleValue: true },
      { type: "dateTime", operation: "empty", label: "is empty", singleValue: true },
      { type: "dateTime", operation: "notEmpty", label: "is not empty", singleValue: true },
      { type: "dateTime", operation: "equals", label: "is equal to" },
      { type: "dateTime", operation: "notEquals", label: "is not equal to" },
      { type: "dateTime", operation: "after", label: "is after" },
      { type: "dateTime", operation: "before", label: "is before" },
      { type: "dateTime", operation: "afterOrEquals", label: "is after or equal to" },
      { type: "dateTime", operation: "beforeOrEquals", label: "is before or equal to" },
    ],
  },
  {
    type: "boolean",
    label: "Boolean",
    badge: "●",
    ops: [
      { type: "boolean", operation: "exists", label: "exists", singleValue: true },
      { type: "boolean", operation: "notExists", label: "does not exist", singleValue: true },
      { type: "boolean", operation: "empty", label: "is empty", singleValue: true },
      { type: "boolean", operation: "notEmpty", label: "is not empty", singleValue: true },
      { type: "boolean", operation: "true", label: "is true", singleValue: true },
      { type: "boolean", operation: "false", label: "is false", singleValue: true },
      { type: "boolean", operation: "equals", label: "is equal to" },
      { type: "boolean", operation: "notEquals", label: "is not equal to" },
    ],
  },
  {
    type: "array",
    label: "Array",
    badge: "[ ]",
    ops: [
      { type: "array", operation: "exists", label: "exists", singleValue: true },
      { type: "array", operation: "notExists", label: "does not exist", singleValue: true },
      { type: "array", operation: "empty", label: "is empty", singleValue: true },
      { type: "array", operation: "notEmpty", label: "is not empty", singleValue: true },
      { type: "array", operation: "contains", label: "contains" },
      { type: "array", operation: "notContains", label: "does not contain" },
      { type: "array", operation: "lengthEquals", label: "length equal to" },
      { type: "array", operation: "lengthNotEquals", label: "length not equal to" },
      { type: "array", operation: "lengthGt", label: "length greater than" },
      { type: "array", operation: "lengthLt", label: "length less than" },
      { type: "array", operation: "lengthGte", label: "length greater than or equal to" },
      { type: "array", operation: "lengthLte", label: "length less than or equal to" },
    ],
  },
  {
    type: "object",
    label: "Object",
    badge: "{ }",
    ops: [
      { type: "object", operation: "exists", label: "exists", singleValue: true },
      { type: "object", operation: "notExists", label: "does not exist", singleValue: true },
      { type: "object", operation: "empty", label: "is empty", singleValue: true },
      { type: "object", operation: "notEmpty", label: "is not empty", singleValue: true },
    ],
  },
];

export const ALL_FILTER_OPERATORS = FILTER_OPERATOR_GROUPS.flatMap((group) => group.ops);

export function filterOperatorKey(type: string, operation: string): string {
  return `${type}:${operation}`;
}

export function findFilterOperator(type: string, operation: string): FilterOperatorChoice | undefined {
  return ALL_FILTER_OPERATORS.find((op) => op.type === type && op.operation === operation);
}

export function filterTypeBadge(type: string): string {
  return FILTER_OPERATOR_GROUPS.find((group) => group.type === type)?.badge ?? "T";
}

export function operandString(value: unknown): string {
  return value == null ? "" : String(value);
}
