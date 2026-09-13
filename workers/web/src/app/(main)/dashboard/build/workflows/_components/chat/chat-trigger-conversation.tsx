"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Loader2, SendHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { parseChatAuthChallenge, type ChatAuthChallenge } from "./chat-auth";

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

export async function postChatTriggerMessage(params: {
  endpointUrl: string;
  sessionId: string;
  chatInput: string;
}): Promise<{ output: string; executionKey?: string; status?: string }> {
  const res = await fetch(params.endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "sendMessage",
      sessionId: params.sessionId,
      chatInput: params.chatInput,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const challenge = parseChatAuthChallenge(res.status, data);
  if (challenge) {
    throw new ChatAuthRequiredError(challenge);
  }
  if (!res.ok) {
    throw new Error(String(data.error ?? `Request failed (${res.status})`));
  }
  const raw = data.output ?? data.text ?? data.message;
  const output =
    typeof raw === "string"
      ? raw
      : raw != null
        ? JSON.stringify(raw, null, 2)
        : "";
  return {
    output,
    executionKey: typeof data.executionKey === "string" ? data.executionKey : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
  };
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
}) {
  const t = useTranslations("WorkflowEditorPage");
  const [text, setText] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = !!sending;

  const userHistory = useMemo(
    () => messages.filter((message) => message.role === "user").map((message) => message.content),
    [messages],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

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
      onSendingChange?.(true);
      onSendStart?.();
      try {
        const result = await postChatTriggerMessage({ endpointUrl, sessionId, chatInput });
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
        {busy ? (
          <div className="text-muted-foreground flex items-center gap-2 self-start text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            {t("chat_thinking")}
          </div>
        ) : null}
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
