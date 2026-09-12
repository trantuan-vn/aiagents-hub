const GENERIC_MANUAL_LABELS = new Set([
  "",
  "manual",
  "Trigger",
  "Trigger manually",
  "Kích hoạt thủ công",
  "When clicking 'Execute workflow'",
  "Khi bấm 'Execute workflow'",
]);

const GENERIC_SCHEDULE_LABELS = new Set([
  "",
  "schedule",
  "On a schedule",
  "Theo lịch",
  "Schedule Trigger",
  "Trigger theo lịch",
]);

const GENERIC_CHAT_LABELS = new Set([
  "",
  "chat",
  "On chat message",
  "Khi có tin nhắn chat",
  "When chat message received",
  "Khi nhận tin nhắn chat",
]);

export function isGenericManualTriggerLabel(label: string | undefined): boolean {
  return GENERIC_MANUAL_LABELS.has((label ?? "").trim());
}

export function isGenericScheduleTriggerLabel(label: string | undefined): boolean {
  return GENERIC_SCHEDULE_LABELS.has((label ?? "").trim());
}

export function isGenericChatTriggerLabel(label: string | undefined): boolean {
  return GENERIC_CHAT_LABELS.has((label ?? "").trim());
}

