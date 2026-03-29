import { getToolName, isToolUIPart, type ChatStatus, type UIMessage } from "ai";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "form" | "table" | "chart" | "multidim";
  payload?: unknown;
  suggestedActions?: Array<{ label: string; path: string }>;
  toolProgressLines?: string[];
  timestamp: Date;
}

export type AskAiMetadata = {
  requestId?: string;
  suggestedActions?: Array<{ label: string; path: string }>;
};

export type AskAiUIMessage = UIMessage<AskAiMetadata>;

const QUICK_ACTIONS_MEMBER: Array<{ label: string; path: string }> = [
  { label: "API Keys", path: "/dashboard/control/token" },
  { label: "Đơn hàng", path: "/dashboard/control/billing" },
  { label: "Logs", path: "/dashboard/monitor/logs" },
  { label: "Analytics", path: "/dashboard/monitor/analytics" },
];

const QUICK_ACTIONS_ADMIN: Array<{ label: string; path: string }> = [
  { label: "Default", path: "/dashboard/default" },
  { label: "Finance", path: "/dashboard/finance" },
  { label: "CRM", path: "/dashboard/crm" },
];

/** Đồng bộ nhãn với auth-worker `askAiToolLabelVi`. */
const ASK_AI_TOOL_LABEL_VI: Record<string, string> = {
  create_api_key: "Tạo API key",
  revoke_api_key: "Thu hồi API key",
  create_order: "Tạo đơn hàng",
  reindex_ask_ai_knowledge: "Cập nhật chỉ mục tài liệu",
};

export function getQuickActions(isAdmin: boolean): Array<{ label: string; path: string }> {
  return [...QUICK_ACTIONS_MEMBER, ...(isAdmin ? QUICK_ACTIONS_ADMIN : [])];
}

function toolLabelVi(toolName: string): string {
  return ASK_AI_TOOL_LABEL_VI[toolName] ?? toolName;
}

/** Dòng trạng thái từ stream `streamText` → UI message parts (tool). */
export function getToolProgressLinesFromParts(parts: AskAiUIMessage["parts"]): string[] {
  const lines: string[] = [];
  for (const p of parts) {
    if (!isToolUIPart(p)) continue;
    const name = getToolName(p);
    const lb = toolLabelVi(name);
    const st = p.state;
    if (st === "input-streaming" || st === "input-available") {
      lines.push(`Đang chạy: ${lb}…`);
    } else if (st === "output-available") {
      lines.push(`Đã xong: ${lb}`);
    } else if (st === "output-error") {
      lines.push(`Lỗi: ${lb}`);
    } else if (st === "output-denied") {
      lines.push(`Đã từ chối: ${lb}`);
    }
  }
  return lines;
}

function extractJsonObject(raw: string): string | null {
  const m = raw.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function getTextFromUiMessage(msg: AskAiUIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function isStructuredMessageType(t: string): t is NonNullable<ChatMessageData["type"]> {
  return t === "text" || t === "form" || t === "table" || t === "chart" || t === "multidim";
}

function unwrapNestedFormPayload(msgType: NonNullable<ChatMessageData["type"]>, payload: unknown): unknown {
  if (msgType !== "form" || payload === null || typeof payload !== "object") {
    return payload;
  }
  const nested = (payload as { form?: unknown }).form;
  if (nested !== null && typeof nested === "object") {
    return nested;
  }
  return payload;
}

type ParsedAssistantJson = {
  content: string;
  type: NonNullable<ChatMessageData["type"]>;
  payload: unknown;
};

function parseAssistantJsonMessage(text: string): ParsedAssistantJson | null {
  const j = extractJsonObject(text.trim());
  if (!j) return null;
  try {
    const o = JSON.parse(j) as { type?: string; content?: string; payload?: unknown };
    if (!o.type || typeof o.content !== "string") return null;
    const rawType = o.type;
    const msgType: NonNullable<ChatMessageData["type"]> = isStructuredMessageType(rawType) ? rawType : "text";
    const pl = unwrapNestedFormPayload(msgType, o.payload ?? null);
    return {
      content: o.content,
      type: msgType,
      payload: pl as ChatMessageData["payload"],
    };
  } catch {
    return null;
  }
}

export function uiMessageToChatMessageData(
  msg: AskAiUIMessage,
  options: { isLastAssistant: boolean; chatStatus: ChatStatus },
): ChatMessageData {
  const text = getTextFromUiMessage(msg);
  const suggested = msg.metadata?.suggestedActions;
  const toolProgressLines = msg.role === "assistant" ? getToolProgressLinesFromParts(msg.parts) : undefined;

  if (msg.role === "user") {
    return {
      id: msg.id,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
  }

  const streaming =
    options.isLastAssistant && (options.chatStatus === "streaming" || options.chatStatus === "submitted");

  if (streaming) {
    return {
      id: msg.id,
      role: "assistant",
      content: text,
      type: "text",
      suggestedActions: suggested,
      toolProgressLines,
      timestamp: new Date(),
    };
  }

  const parsed = parseAssistantJsonMessage(text);
  if (parsed) {
    return {
      id: msg.id,
      role: "assistant",
      content: parsed.content,
      type: parsed.type,
      payload: parsed.payload,
      suggestedActions: suggested,
      toolProgressLines,
      timestamp: new Date(),
    };
  }

  return {
    id: msg.id,
    role: "assistant",
    content: text,
    type: "text",
    suggestedActions: suggested,
    toolProgressLines,
    timestamp: new Date(),
  };
}
