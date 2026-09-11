const GENERIC_MANUAL_LABELS = new Set([
  "",
  "manual",
  "Trigger",
  "Trigger manually",
  "Kích hoạt thủ công",
  "When clicking 'Execute workflow'",
  "Khi bấm 'Execute workflow'",
]);

export function isGenericManualTriggerLabel(label: string | undefined): boolean {
  return GENERIC_MANUAL_LABELS.has((label ?? "").trim());
}
