"use client";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import type { ScheduleInterval, ScheduleRule } from "@aiagents-hub/workflow-nodes";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Translate = ReturnType<typeof useTranslations<"WorkflowNodeRegistry">>;
type RuleFieldsProps = {
  rule: ScheduleRule;
  onChange: (partial: Partial<ScheduleRule>) => void;
  t: Translate;
};

const INTERVALS: { id: ScheduleInterval; labelKey: Parameters<Translate>[0] }[] = [
  { id: "seconds", labelKey: "trigger_schedule_seconds" },
  { id: "minutes", labelKey: "trigger_schedule_minutes" },
  { id: "hours", labelKey: "trigger_schedule_hours" },
  { id: "days", labelKey: "trigger_schedule_days" },
  { id: "weeks", labelKey: "trigger_schedule_weeks" },
  { id: "months", labelKey: "trigger_schedule_months" },
  { id: "cron", labelKey: "trigger_schedule_cron" },
];

const WEEKDAYS: { day: number; labelKey: Parameters<Translate>[0] }[] = [
  { day: 0, labelKey: "trigger_schedule_dow_0" },
  { day: 1, labelKey: "trigger_schedule_dow_1" },
  { day: 2, labelKey: "trigger_schedule_dow_2" },
  { day: 3, labelKey: "trigger_schedule_dow_3" },
  { day: 4, labelKey: "trigger_schedule_dow_4" },
  { day: 5, labelKey: "trigger_schedule_dow_5" },
  { day: 6, labelKey: "trigger_schedule_dow_6" },
];

export function ScheduleRuleFields({
  rule,
  onChange,
}: {
  rule: ScheduleRule;
  onChange: (partial: Partial<ScheduleRule>) => void;
}) {
  const t = useTranslations("WorkflowNodeRegistry");
  const props = { rule, onChange, t };
  return (
    <div className="space-y-3">
      <Field label={t("trigger_schedule_interval")}>
        <Select value={rule.field} onValueChange={(value) => onChange({ field: value as ScheduleInterval })}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map((interval) => (
              <SelectItem key={interval.id} value={interval.id}>
                {t(interval.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {rule.field === "seconds" ? <SecondsFields {...props} /> : null}
      {rule.field === "minutes" ? <MinutesFields {...props} /> : null}
      {rule.field === "hours" ? <HoursFields {...props} /> : null}
      {rule.field === "days" ? <DaysFields {...props} /> : null}
      {rule.field === "weeks" ? <WeeksFields {...props} /> : null}
      {rule.field === "months" ? <MonthsFields {...props} /> : null}
      {rule.field === "cron" ? <CronFields {...props} /> : null}
    </div>
  );
}

function SecondsFields({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <NumberField
      label={t("trigger_schedule_seconds_between")}
      hint={t("trigger_schedule_range_seconds")}
      value={rule.secondsInterval ?? 30}
      min={1}
      max={60}
      onChange={(value) => onChange({ secondsInterval: value })}
    />
  );
}

function MinutesFields({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <NumberField
      label={t("trigger_schedule_minutes_between")}
      hint={t("trigger_schedule_range_minutes")}
      value={rule.minutesInterval ?? 1}
      min={1}
      max={60}
      onChange={(value) => onChange({ minutesInterval: value })}
    />
  );
}

function HoursFields({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <>
      <NumberField
        label={t("trigger_schedule_hours_between")}
        hint={t("trigger_schedule_range_hours")}
        value={rule.hoursInterval ?? 1}
        min={1}
        max={24}
        onChange={(value) => onChange({ hoursInterval: value })}
      />
      <MinuteField rule={rule} onChange={onChange} t={t} />
    </>
  );
}

function DaysFields({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <>
      <NumberField
        label={t("trigger_schedule_days_between")}
        hint={t("trigger_schedule_range_days")}
        value={rule.daysInterval ?? 1}
        min={1}
        max={31}
        onChange={(value) => onChange({ daysInterval: value })}
      />
      <HourField rule={rule} onChange={onChange} t={t} />
      <MinuteField rule={rule} onChange={onChange} t={t} />
    </>
  );
}

function WeeksFields({ rule, onChange, t }: RuleFieldsProps) {
  const selected = rule.triggerAtDay ?? [1];
  return (
    <>
      <NumberField
        label={t("trigger_schedule_weeks_between")}
        hint={t("trigger_schedule_range_weeks")}
        value={rule.weeksInterval ?? 1}
        min={1}
        max={52}
        onChange={(value) => onChange({ weeksInterval: value })}
      />
      <div className="space-y-1.5">
        <Label className="text-sm font-normal">{t("trigger_schedule_trigger_at_day")}</Label>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {WEEKDAYS.map(({ day, labelKey }) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(day)}
                onCheckedChange={(next) => {
                  const updated = next ? [...selected, day] : selected.filter((value) => value !== day);
                  onChange({ triggerAtDay: updated.length ? updated : [day] });
                }}
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </div>
      <HourField rule={rule} onChange={onChange} t={t} />
      <MinuteField rule={rule} onChange={onChange} t={t} />
    </>
  );
}

function MonthsFields({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <>
      <NumberField
        label={t("trigger_schedule_months_between")}
        hint={t("trigger_schedule_range_months")}
        value={rule.monthsInterval ?? 1}
        min={1}
        max={12}
        onChange={(value) => onChange({ monthsInterval: value })}
      />
      <NumberField
        label={t("trigger_schedule_trigger_at_day_of_month")}
        hint={t("trigger_schedule_range_day_of_month")}
        value={rule.triggerAtDayOfMonth ?? 1}
        min={1}
        max={31}
        onChange={(value) => onChange({ triggerAtDayOfMonth: value })}
      />
      <HourField rule={rule} onChange={onChange} t={t} />
      <MinuteField rule={rule} onChange={onChange} t={t} />
    </>
  );
}

function CronFields({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <Field label={t("trigger_schedule_cron_expression")} hint={t("trigger_schedule_cron_hint")}>
      <Input
        value={rule.expression ?? ""}
        onChange={(event) => onChange({ expression: event.target.value })}
        placeholder="0 0 * * *"
        className="font-mono text-sm"
      />
    </Field>
  );
}

function HourField({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <Field label={t("trigger_schedule_trigger_at_hour")}>
      <Select value={String(rule.triggerAtHour ?? 0)} onValueChange={(value) => onChange({ triggerAtHour: Number(value) })}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 24 }, (_, hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hourLabel(hour, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function MinuteField({ rule, onChange, t }: RuleFieldsProps) {
  return (
    <NumberField
      label={t("trigger_schedule_trigger_at_minute")}
      hint={t("trigger_schedule_range_minute")}
      value={rule.triggerAtMinute ?? 0}
      min={0}
      max={59}
      onChange={(value) => onChange({ triggerAtMinute: value })}
    />
  );
}

function hourLabel(hour: number, t: Translate) {
  if (hour === 0) return t("trigger_schedule_hour_midnight");
  if (hour === 12) return t("trigger_schedule_hour_noon");
  if (hour < 12) return t("trigger_schedule_hour_am", { hour });
  return t("trigger_schedule_hour_pm", { hour: hour - 12 });
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-normal">{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </Field>
  );
}
