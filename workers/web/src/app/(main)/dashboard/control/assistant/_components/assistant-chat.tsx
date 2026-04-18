"use client";

import { useMemo, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type ChatStatus } from "ai";
import { Loader2, SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { CreateApiKeyToolView, CreateOrderToolView } from "./assistant-tool-views";
import type { AssistantUIMessage } from "./assistant-types";

type AssistantMessagePart = NonNullable<AssistantUIMessage["parts"]>[number];

function isLoadingToolOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || !("state" in output)) return false;
  return (output as { state: unknown }).state === "loading";
}

function describeCreateApiKeyTool(part: Extract<AssistantMessagePart, { type: "tool-createApiKey" }>): string | null {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return "Model đang chọn tham số tạo API key → sẽ gọi auth-worker /dashboard/token/create.";
  }
  if (part.state === "output-available" && isLoadingToolOutput(part.output)) {
    return "Backend: đang gọi auth-worker POST /dashboard/token/create (tạo API key)…";
  }
  return null;
}

function describeCreateOrderTool(part: Extract<AssistantMessagePart, { type: "tool-createOrder" }>): string | null {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return "Model đang chọn tham số đơn hàng → sẽ gọi auth-worker /dashboard/order/orders.";
  }
  if (part.state === "output-available" && isLoadingToolOutput(part.output)) {
    return "Backend: đang gọi auth-worker POST /dashboard/order/orders (tạo đơn)…";
  }
  return null;
}

function describeToolPartActivity(part: AssistantMessagePart): string | null {
  if (!isToolUIPart(part)) return null;
  if (part.type === "tool-createApiKey") return describeCreateApiKeyTool(part);
  if (part.type === "tool-createOrder") return describeCreateOrderTool(part);
  return null;
}

function describeActivityFromLastAssistantMessage(messages: AssistantUIMessage[]): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || last.parts.length === 0) return null;
  const parts = last.parts;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts.at(i);
    if (!part) continue;
    const line = describeToolPartActivity(part);
    if (line) return line;
  }
  return null;
}

function describeBackendActivity(status: ChatStatus, messages: AssistantUIMessage[]): string {
  if (status === "error") return "Có lỗi khi gọi auth-worker /dashboard/assistant/chat.";
  if (status === "submitted") return "Đang gửi tin nhắn tới auth-worker /dashboard/assistant/chat…";

  // Remaining ChatStatus is only 'streaming' | 'ready'
  const fromParts = describeActivityFromLastAssistantMessage(messages);
  if (fromParts) return fromParts;

  if (status === "streaming") return "Auth-worker assistant đang stream phản hồi (Workers AI + tools)…";
  return "";
}

function AssistantMessagePartView({ index, part }: { index: number; part: AssistantMessagePart }) {
  if (part.type === "text") {
    return <p className="text-sm whitespace-pre-wrap">{part.text}</p>;
  }
  if (part.type === "step-start") {
    return index > 0 ? <hr className="border-muted my-2" /> : null;
  }
  if (part.type === "tool-createApiKey") {
    return <CreateApiKeyToolView part={part} />;
  }
  if (part.type === "tool-createOrder") {
    return <CreateOrderToolView part={part} />;
  }
  return null;
}

function AssistantMessagesList({ emptyLabel, messages }: { emptyLabel: string; messages: AssistantUIMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  return messages.map((message) => (
    <div key={message.id} className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium uppercase">{message.role}</div>
      <div className="space-y-2 pl-0">
        {message.parts.map((part, index) => (
          // eslint-disable-next-line react/no-array-index-key -- SDK parts are ordered; not all part kinds expose stable ids
          <AssistantMessagePartView key={`${message.id}-${index}`} index={index} part={part} />
        ))}
      </div>
    </div>
  ));
}

export function AssistantChat() {
  const t = useTranslations("AssistantPage");
  const [text, setText] = useState("");
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}/dashboard/assistant/chat`,
        credentials: "include",
      }),
    [apiBaseUrl],
  );

  const { messages, sendMessage, status, stop, error } = useChat<AssistantUIMessage>({ transport });

  const activity = describeBackendActivity(status, messages);

  return (
    <div className="flex h-[min(720px,calc(100vh-12rem))] flex-col gap-4">
      <div className="bg-muted/40 text-muted-foreground flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <Loader2
          className={`h-4 w-4 shrink-0 ${status === "streaming" || status === "submitted" ? "animate-spin" : "opacity-40"}`}
        />
        <span className="min-w-0 flex-1">{activity || t("activity_idle")}</span>
      </div>

      {error ? <p className="text-destructive text-sm">{error.message}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border p-4">
        <AssistantMessagesList emptyLabel={t("empty")} messages={messages} />
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void sendMessage({ text });
          setText("");
        }}
      >
        <Textarea
          className="min-h-[88px] flex-1 resize-y"
          placeholder={t("placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex shrink-0 gap-2 sm:flex-col">
          {(status === "streaming" || status === "submitted") && (
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => stop()}>
              <Square className="mr-2 h-4 w-4" />
              {t("stop")}
            </Button>
          )}
          <Button type="submit" disabled={status === "streaming" || status === "submitted" || !text.trim()}>
            <SendHorizontal className="mr-2 h-4 w-4" />
            {t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}
