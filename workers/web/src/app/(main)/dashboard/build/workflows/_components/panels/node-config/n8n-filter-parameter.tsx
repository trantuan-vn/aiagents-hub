"use client";

import { useRef } from "react";

import {
  defaultFilterCondition,
  defaultFilterValue,
  isSingleValueOperation,
  newFilterConditionId,
  parseFilterValue,
  type FilterCondition,
  type FilterOperatorType,
  type FilterValue,
} from "@aiagents-hub/workflow-nodes";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { N8nNodeProperty } from "@/lib/n8n-workflow/types";

import { ExpressionDropField } from "./expression-drop-field";
import {
  FILTER_OPERATOR_GROUPS,
  filterOperatorKey,
  filterTypeBadge,
  findFilterOperator,
  operandString,
} from "./n8n-filter-operators";

function FilterConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
}: {
  condition: FilterCondition;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const key = filterOperatorKey(condition.operator.type, condition.operator.operation);
  const hideRight = condition.operator.singleValue === true || isSingleValueOperation(condition.operator.operation);
  const selected = findFilterOperator(condition.operator.type, condition.operator.operation);

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <ExpressionDropField
            value={operandString(condition.leftValue)}
            placeholder="value1"
            onChange={(leftValue) => onChange({ ...condition, leftValue })}
          />
          {hideRight ? null : (
            <ExpressionDropField
              value={operandString(condition.rightValue)}
              placeholder="value2"
              onChange={(rightValue) => onChange({ ...condition, rightValue })}
            />
          )}
        </div>
        <div className="flex w-[11.5rem] shrink-0 items-start gap-1">
          <Select
            value={key}
            onValueChange={(next) => {
              const [type, operation] = next.split(":") as [FilterOperatorType, string];
              const choice = findFilterOperator(type, operation);
              onChange({
                ...condition,
                operator: {
                  type,
                  operation,
                  singleValue: choice?.singleValue === true || isSingleValueOperation(operation),
                },
                rightValue: choice?.singleValue ? "" : condition.rightValue,
              });
            }}
          >
            <SelectTrigger className="h-9 w-full min-w-0 text-xs">
              <SelectValue>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {filterTypeBadge(condition.operator.type)}
                  </span>
                  <span className="truncate">{selected?.label ?? "is equal to"}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPERATOR_GROUPS.map((group) => (
                <SelectGroup key={group.type}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.ops.map((op) => (
                    <SelectItem
                      key={filterOperatorKey(op.type, op.operation)}
                      value={filterOperatorKey(op.type, op.operation)}
                    >
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={onRemove}
              aria-label="Remove condition"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function N8nFilterParameter({
  property,
  value,
  onChange,
}: {
  property: N8nNodeProperty;
  value: unknown;
  onChange: (value: FilterValue) => void;
}) {
  const fallbackRef = useRef<FilterValue | null>(null);
  const parsed = parseFilterValue(value);
  if ((!parsed || parsed.conditions.length === 0) && !fallbackRef.current) {
    fallbackRef.current = defaultFilterValue();
  }
  const filter = parsed && parsed.conditions.length > 0 ? parsed : (fallbackRef.current ?? defaultFilterValue());
  const conditions = filter.conditions;
  const addLabel = property.placeholder ?? "Add condition";

  const patch = (next: Partial<FilterValue>) => {
    onChange({
      combinator: filter.combinator,
      conditions,
      options: filter.options ?? defaultFilterValue().options,
      ...next,
    });
  };

  return (
    <div className="space-y-2">
      <Label>{property.displayName}</Label>
      {conditions.map((condition, index) => (
        <div key={condition.id} className="space-y-2">
          {index > 0 ? (
            <Select
              value={filter.combinator}
              onValueChange={(combinator) => patch({ combinator: combinator === "or" ? "or" : "and" })}
            >
              <SelectTrigger className="h-8 w-24 text-xs uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">AND</SelectItem>
                <SelectItem value="or">OR</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <FilterConditionRow
            condition={condition}
            canRemove={conditions.length > 1}
            onChange={(next) => {
              const nextConditions = conditions.slice();
              nextConditions[index] = next;
              patch({ conditions: nextConditions });
            }}
            onRemove={() => patch({ conditions: conditions.filter((_, i) => i !== index) })}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 justify-start text-xs font-normal"
        onClick={() =>
          patch({ conditions: [...conditions, { ...defaultFilterCondition(), id: newFilterConditionId() }] })
        }
      >
        <Plus className="mr-1.5 size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}
