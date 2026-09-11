import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { HandleDefinition } from "../../types/handles";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { TRIGGER_KIND_FIELD } from "./kinds";

export const SCHEDULE_INTERVALS = [
  "seconds",
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "cron",
] as const;

export type ScheduleInterval = (typeof SCHEDULE_INTERVALS)[number];

/** n8n-style schedule rule stored on `node.data.scheduleRules`. */
export type ScheduleRule = {
  field: ScheduleInterval;
  secondsInterval?: number;
  minutesInterval?: number;
  hoursInterval?: number;
  daysInterval?: number;
  weeksInterval?: number;
  monthsInterval?: number;
  triggerAtHour?: number;
  triggerAtMinute?: number;
  /** 0 = Sunday … 6 = Saturday */
  triggerAtDay?: number[];
  triggerAtDayOfMonth?: number;
  expression?: string;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function defaultScheduleRule(): ScheduleRule {
  return {
    field: "hours",
    hoursInterval: 1,
    triggerAtMinute: 0,
  };
}

export function normalizeScheduleRule(value: unknown): ScheduleRule {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const field = SCHEDULE_INTERVALS.includes(raw.field as ScheduleInterval)
    ? (raw.field as ScheduleInterval)
    : "days";
  const triggerAtDay = Array.isArray(raw.triggerAtDay)
    ? raw.triggerAtDay
        .map((day) => clamp(asNumber(day, 1), 0, 6))
        .filter((day, index, all) => all.indexOf(day) === index)
        .sort((a, b) => a - b)
    : undefined;
  return {
    field,
    secondsInterval: clamp(asNumber(raw.secondsInterval, 30), 1, 60),
    minutesInterval: clamp(asNumber(raw.minutesInterval, 1), 1, 60),
    hoursInterval: clamp(asNumber(raw.hoursInterval, 1), 1, 24),
    daysInterval: clamp(asNumber(raw.daysInterval, 1), 1, 31),
    weeksInterval: clamp(asNumber(raw.weeksInterval, 1), 1, 52),
    monthsInterval: clamp(asNumber(raw.monthsInterval, 1), 1, 12),
    triggerAtHour: clamp(asNumber(raw.triggerAtHour, 0), 0, 23),
    triggerAtMinute: clamp(asNumber(raw.triggerAtMinute, 0), 0, 59),
    triggerAtDay: triggerAtDay?.length ? triggerAtDay : [1],
    triggerAtDayOfMonth: clamp(asNumber(raw.triggerAtDayOfMonth, 1), 1, 31),
    expression: typeof raw.expression === "string" ? raw.expression : "0 0 * * *",
  };
}

export function parseScheduleRules(value: unknown): ScheduleRule[] {
  if (!Array.isArray(value) || value.length === 0) return [defaultScheduleRule()];
  return value.map(normalizeScheduleRule);
}

/** Convert one n8n-style rule to a 5-field UTC cron expression. */
export function scheduleRuleToCron(rule: ScheduleRule): string | null {
  const minute = clamp(rule.triggerAtMinute ?? 0, 0, 59);
  const hour = clamp(rule.triggerAtHour ?? 0, 0, 23);
  switch (rule.field) {
    case "seconds":
      return "* * * * *";
    case "minutes": {
      const n = clamp(rule.minutesInterval ?? 1, 1, 60);
      return n >= 60 ? `${minute} * * * *` : `*/${n} * * * *`;
    }
    case "hours": {
      const n = clamp(rule.hoursInterval ?? 1, 1, 24);
      return n >= 24 ? `${minute} ${hour} * * *` : `${minute} */${n} * * *`;
    }
    case "days": {
      const n = clamp(rule.daysInterval ?? 1, 1, 31);
      return n <= 1 ? `${minute} ${hour} * * *` : `${minute} ${hour} */${n} * *`;
    }
    case "weeks": {
      const days = (rule.triggerAtDay?.length ? rule.triggerAtDay : [1])
        .map((day) => clamp(day, 0, 6))
        .filter((day, index, all) => all.indexOf(day) === index)
        .sort((a, b) => a - b);
      return `${minute} ${hour} * * ${days.join(",")}`;
    }
    case "months": {
      const n = clamp(rule.monthsInterval ?? 1, 1, 12);
      const day = clamp(rule.triggerAtDayOfMonth ?? 1, 1, 31);
      return n <= 1 ? `${minute} ${hour} ${day} * *` : `${minute} ${hour} ${day} */${n} *`;
    }
    case "cron": {
      const expr = (rule.expression ?? "").trim();
      return expr.split(/\s+/).length === 5 ? expr : null;
    }
    default:
      return null;
  }
}

export function collectScheduleCronExprs(rules: ScheduleRule[]): string[] {
  const seen = new Set<string>();
  const exprs: string[] = [];
  for (const rule of rules) {
    const expr = scheduleRuleToCron(rule);
    if (!expr || seen.has(expr)) continue;
    seen.add(expr);
    exprs.push(expr);
  }
  return exprs;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** n8n-compatible timestamp fields emitted when the schedule trigger fires. */
export function buildScheduleTriggerOutput(at: Date = new Date()): Record<string, unknown> {
  const hour = at.getUTCHours();
  const minute = at.getUTCMinutes();
  const second = at.getUTCSeconds();
  const hour12 = hour % 12 || 12;
  const ampm = hour < 12 ? "am" : "pm";
  return {
    timestamp: at.getTime(),
    "Readable date": `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}, ${at.getUTCFullYear()}, ${hour12}:${pad2(minute)}:${pad2(second)} ${ampm}`,
    "Readable time": `${hour12}:${pad2(minute)}:${pad2(second)} ${ampm}`,
    "Day of week": WEEKDAYS[at.getUTCDay()],
    Year: String(at.getUTCFullYear()),
    Month: MONTHS[at.getUTCMonth()],
    "Day of month": pad2(at.getUTCDate()),
    Hour: pad2(hour),
    Minute: pad2(minute),
    Second: pad2(second),
    Timezone: "UTC",
  };
}

export function scheduleTriggerDefaultData(): Record<string, unknown> {
  const rule = defaultScheduleRule();
  return {
    label: "Schedule Trigger",
    [TRIGGER_KIND_FIELD]: "schedule",
    scheduleRules: [rule],
    cronExpr: scheduleRuleToCron(rule),
  };
}

const SCHEDULE_HANDLES: HandleDefinition[] = [
  { id: "out", type: "source", connectionType: "main", position: "right" },
];

export const TRIGGER_SCHEDULE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "trigger:schedule",
  runtimeType: "trigger",
  kind: "schedule",
  nameKey: "trigger_kind_schedule",
  descriptionKey: "trigger_kind_schedule_desc",
  category: "trigger",
  icon: "Clock",
  defaultData: scheduleTriggerDefaultData(),
  handles: SCHEDULE_HANDLES,
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: TRIGGER_KIND_FIELD,
        type: "select",
        labelKey: "field_trigger_kind",
        defaultValue: "schedule",
        options: [{ value: "schedule", labelKey: "trigger_kind_schedule" }],
        order: 1,
      },
    ]),
    defaultOutputSection(false),
  ],
});
