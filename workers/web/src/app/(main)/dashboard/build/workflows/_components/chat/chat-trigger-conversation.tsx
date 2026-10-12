"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Check, Clock, Loader2, Minus, SendHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { parseChatAuthChallenge, type ChatAuthChallenge } from "./chat-auth";
import {
  applyChatRunEvent,
  pickChatRunLog,
  type ChatActivityItem,
  type ChatProgressEvent,
  type ChatRunStep,
  type ChatRunStepStatus,
} from "./chat-run-log";

export type ChatTriggerRole = "user" | "assistant" | "error";

export type ChatTriggerMessage = {
  id: string;
  role: ChatTriggerRole;
  content: string;
};

export function parseChatInitialMessages(value: string | undefined): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function seedChatTriggerMessages(initialMessages?: string): ChatTriggerMessage[] {
  return parseChatInitialMessages(initialMessages).map((content, index) => ({
    id: `intro-${index}`,
    role: "assistant" as const,
    content,
  }));
}

export function newChatSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

export class ChatAuthRequiredError extends Error {
  challenge: ChatAuthChallenge;

  constructor(challenge: ChatAuthChallenge) {
    super("Authentication required");
    this.name = "ChatAuthRequiredError";
    this.challenge = challenge;
  }
}

function looksLikeJsonBlob(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function sqlCandidate(value: unknown): string {
  if (typeof value !== "string") return "";
  let text = value.trim().replace(/^```sql\s*/i, "").replace(/```$/g, "").trim();
  const embedded = text.match(/\b((?:WITH|SELECT)\b[\s\S]{8,20000}?)(?:;|$)/i);
  if (embedded?.[1] && !/^(?:WITH|SELECT)\b/i.test(text)) text = embedded[1].trim();
  if (!/^(?:WITH|SELECT)\b/i.test(text)) return "";
  const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 1) return "";
  return `${parts[0]};`;
}

export function chatBubbleText(raw: unknown, depth = 0): string {
  if (depth > 5) return "";
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (looksLikeJsonBlob(trimmed)) {
      try {
        const inner = chatBubbleText(JSON.parse(trimmed) as unknown, depth + 1);
        if (inner) return inner;
      } catch {
        return sqlCandidate(trimmed) || trimmed;
      }
    }
    return sqlCandidate(trimmed) || trimmed;
  }
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const nestedSql = (value: unknown) =>
      value && typeof value === "object" ? chatBubbleText(value, depth + 1) : sqlCandidate(value);
    const sql =
      sqlCandidate(rec.sql) ||
      sqlCandidate(rec.artifact) ||
      nestedSql(rec.body) ||
      nestedSql(rec.data) ||
      nestedSql(rec.result);
    if (rec.status === "needs_clarification" || rec.status === "refused") {
      if (typeof rec.text === "string" && rec.text.trim() && !looksLikeJsonBlob(rec.text)) return rec.text.trim();
    }
    if (rec.status === "ok" && sql) return sql;
    if (typeof rec.text === "string" && rec.text.trim()) {
      if (looksLikeJsonBlob(rec.text)) {
        const inner = chatBubbleText(rec.text, depth + 1);
        if (inner && !looksLikeJsonBlob(inner)) return inner;
      } else if (!sql) {
        return rec.text.trim();
      }
    }
    if (sql) return sql;
  }
  return "";
}

function chatResultFromPayload(data: Record<string, unknown>): { output: string; executionKey?: string; status?: string } {
  const raw = data.output ?? data.text ?? data.message;
  return {
    output: chatBubbleText(raw),
    executionKey: typeof data.executionKey === "string" ? data.executionKey : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
  };
}

async function readChatProgressStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (event: ChatProgressEvent) => void,
): Promise<{ output: string; executionKey?: string; status?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { output: string; executionKey?: string; status?: string } | null = null;
  const consume = (block: string) => {
    const line = block
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("data:"));
    if (!line) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
    } catch {
      return;
    }
    if (data.type === "error") {
      throw new Error(String(data.error ?? "Chat workflow failed"));
    }
    if (data.type === "result") {
      result = chatResultFromPayload(data);
      return;
    }
    onProgress?.(data as ChatProgressEvent);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) consume(block);
  }
  if (buffer.trim()) consume(buffer);
  if (!result) throw new Error("Chat workflow failed");
  return result;
}

export async function postChatTriggerMessage(params: {
  endpointUrl: string;
  sessionId: string;
  chatInput: string;
  onProgress?: (event: ChatProgressEvent) => void;
}): Promise<{ output: string; executionKey?: string; status?: string }> {
  const res = await fetch(params.endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "sendMessage",
      sessionId: params.sessionId,
      chatInput: params.chatInput,
    }),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && res.ok && res.body) {
    return readChatProgressStream(res.body, params.onProgress);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const challenge = parseChatAuthChallenge(res.status, data);
  if (challenge) {
    throw new ChatAuthRequiredError(challenge);
  }
  if (!res.ok) {
    throw new Error(String(data.error ?? `Request failed (${res.status})`));
  }
  return chatResultFromPayload(data);
}

function RunStatusIcon({ status }: { status: ChatRunStepStatus }) {
  if (status === "running") return <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-hidden />;
  if (status === "success") return <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  if (status === "error") return <X className="size-3.5 text-red-600 dark:text-red-400" aria-hidden />;
  if (status === "pending_human") return <Clock className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />;
  return <Minus className="text-muted-foreground size-3.5" aria-hidden />;
}

function workLabel(
  item: ChatActivityItem,
  t: ReturnType<typeof useTranslations<"WorkflowEditorPage">>,
): string {
  if (item.work === "tool") return t("chat_work_tool", { tool: item.tool || "tool" });
  if (item.work === "rewrite") return t("chat_work_rewrite");
  if (item.work === "retrieve") return t("chat_work_retrieve");
  if (item.work === "sql") return t("chat_work_sql");
  if (item.work === "validate") return t("chat_work_validate");
  if (item.work === "ask") return t("chat_work_ask");
  if (item.work === "answer") return t("chat_work_answer");
  if (item.work === "reasoning") return t("chat_work_reasoning");
  return item.work;
}

function ChatActivityFeed({ items, live }: { items: ChatActivityItem[]; live: boolean }) {
  const t = useTranslations("WorkflowEditorPage");
  const endRef = useRef<HTMLDivElement>(null);
  const tail = items[items.length - 1]?.text ?? "";
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [tail, items.length]);
  return (
    <ol className="mt-1.5 flex flex-col gap-1.5 border-t pt-2">
      {items.map((item, index) => {
        const current = live && index === items.length - 1;
        return (
          <li key={`${item.work}:${index}`} className="min-w-0">
            <span className={cn("block text-[11px] font-medium", current ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
              {current ? <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden /> : null}
              {workLabel(item, t)}
            </span>
            {item.text ? (
              <pre className="text-foreground/80 mt-0.5 max-h-36 overflow-y-auto font-sans text-[11px] leading-relaxed whitespace-pre-wrap">
                {item.text}
                {current ? <span className="text-amber-600 dark:text-amber-400">▍</span> : null}
              </pre>
            ) : null}
          </li>
        );
      })}
      <div ref={endRef} />
    </ol>
  );
}

function ChatRunStatus({ steps }: { steps: ChatRunStep[] }) {
  const t = useTranslations("WorkflowEditorPage");
  const reasoning = [...steps].reverse().find((step) => step.status === "running" && step.phase === "reasoning" && !step.activityLog?.length);
  const statusLabel = (status: ChatRunStepStatus) => {
    if (status === "running") return t("chat_run_status_running");
    if (status === "success") return t("chat_run_status_success");
    if (status === "error") return t("chat_run_status_error");
    if (status === "pending_human") return t("chat_run_status_pending_human");
    return t("chat_run_status_skipped");
  };
  return (
    <div
      className={cn(
        "bg-background w-full self-start rounded-[14px] border px-3 py-2",
        steps.some((step) => step.activityLog?.length) ? "max-w-full" : "max-w-[78%]",
      )}
    >
      <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        {t("logs_title")}
      </div>
      {steps.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("chat_run_starting")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {steps.map((step, index) => (
            <li key={`${step.nodeId}:${index}`} className="flex items-start gap-2">
              <span className="mt-0.5">
                <RunStatusIcon status={step.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{step.label}</span>
                <span className="text-muted-foreground block truncate text-[10px]">
                  {step.nodeType ? `${step.nodeType.replace(/_/g, " ")} · ` : ""}
                  {statusLabel(step.status)}
                </span>
                {step.activityLog?.length ? (
                  <ChatActivityFeed items={step.activityLog} live={step.status === "running"} />
                ) : step.status === "running" && step.phase === "reasoning" ? (
                  <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-400">{t("chat_run_reasoning")}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {reasoning ? (
        <p className="text-muted-foreground mt-2 border-t pt-2 text-[11px] leading-relaxed">
          {t("chat_run_reasoning_hint", { name: reasoning.label })}
        </p>
      ) : null}
    </div>
  );
}

function Bubble({ message }: { message: ChatTriggerMessage }) {
  const isUser = message.role === "user";
  const isError = message.role === "error";
  return (
    <div
      className={cn(
        "max-w-[78%] rounded-[14px] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
        isUser && "bg-[#ff6f00] text-white self-end",
        isError && "border-destructive/30 bg-destructive/10 text-destructive self-start border",
        !isUser && !isError && "bg-background self-start border",
      )}
    >
      {message.content}
    </div>
  );
}

export function ChatTriggerConversation({
  endpointUrl,
  sessionId,
  inputPlaceholder,
  messages,
  onMessagesChange,
  sending,
  onSendingChange,
  onSendStart,
  onAuthRequired,
  onReply,
  header,
  className,
  emptyHint,
  liveSteps,
}: {
  endpointUrl: string;
  sessionId: string;
  initialMessages?: string;
  inputPlaceholder?: string;
  messages: ChatTriggerMessage[];
  onMessagesChange: (messages: ChatTriggerMessage[]) => void;
  sending?: boolean;
  onSendingChange?: (sending: boolean) => void;
  onSendStart?: () => void;
  onAuthRequired?: (challenge: ChatAuthChallenge) => void;
  onReply?: (result: { output: string; executionKey?: string; status?: string }) => void;
  header?: ReactNode;
  className?: string;
  emptyHint?: string;
  /** Editor log rows already painted from the canvas websocket. */
  liveSteps?: ChatRunStep[];
}) {
  const t = useTranslations("WorkflowEditorPage");
  const [text, setText] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [streamSteps, setStreamSteps] = useState<ChatRunStep[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = !!sending;
  const runSteps = pickChatRunLog(streamSteps, liveSteps);

  const userHistory = useMemo(
    () => messages.filter((message) => message.role === "user").map((message) => message.content),
    [messages],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, runSteps]);

  const send = useCallback(
    async (raw: string) => {
      const chatInput = raw.trim();
      if (!chatInput || busy || !endpointUrl) return;
      const userMessage: ChatTriggerMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: chatInput,
      };
      const next = [...messages, userMessage];
      onMessagesChange(next);
      setText("");
      setHistoryIndex(-1);
      setStreamSteps([]);
      onSendingChange?.(true);
      onSendStart?.();
      try {
        const result = await postChatTriggerMessage({
          endpointUrl,
          sessionId,
          chatInput,
          onProgress: (event) => setStreamSteps((current) => applyChatRunEvent(current, event)),
        });
        const reply = result.output.trim() || t("chat_empty_reply");
        onMessagesChange([
          ...next,
          { id: `assistant-${Date.now()}`, role: "assistant", content: reply },
        ]);
        onReply?.(result);
      } catch (error) {
        if (error instanceof ChatAuthRequiredError) {
          onAuthRequired?.(error.challenge);
        }
        onMessagesChange([
          ...next,
          {
            id: `error-${Date.now()}`,
            role: "error",
            content: error instanceof ChatAuthRequiredError ? t("chat_auth_required") : error instanceof Error ? error.message : t("chat_send_failed"),
          },
        ]);
      } finally {
        setStreamSteps([]);
        onSendingChange?.(false);
      }
    },
    [busy, endpointUrl, messages, onAuthRequired, onMessagesChange, onReply, onSendStart, onSendingChange, sessionId, t],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(text);
  };

  const placeholder = inputPlaceholder?.trim() || t("chat_input_placeholder");

  return (
    <div className={cn("bg-muted/30 flex h-full min-h-0 flex-col", className)}>
      {header}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && emptyHint ? (
          <p className="text-muted-foreground m-auto max-w-sm text-center text-sm">{emptyHint}</p>
        ) : (
          messages.map((message) => <Bubble key={message.id} message={message} />)
        )}
        {busy ? <ChatRunStatus steps={runSteps} /> : null}
      </div>
      <form className="bg-background flex shrink-0 items-end gap-2 border-t px-3 py-2" onSubmit={onSubmit}>
        <textarea
          className="placeholder:text-muted-foreground min-h-10 max-h-28 flex-1 resize-none bg-transparent py-2 text-sm outline-none"
          placeholder={placeholder}
          value={text}
          rows={1}
          onChange={(event) => {
            setText(event.target.value);
            setHistoryIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!busy && text.trim()) void send(text);
              return;
            }
            if (event.key === "ArrowUp" && !text && userHistory.length) {
              event.preventDefault();
              const nextIndex =
                historyIndex < 0 ? userHistory.length - 1 : Math.max(0, historyIndex - 1);
              setHistoryIndex(nextIndex);
              setText(userHistory[nextIndex] ?? "");
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !text.trim()}
          className="size-8 shrink-0 rounded-lg bg-[#ff6f00] text-white hover:bg-[#e66300]"
        >
          <SendHorizontal className="size-4" />
          <span className="sr-only">{t("chat_send")}</span>
        </Button>
      </form>
    </div>
  );
}
