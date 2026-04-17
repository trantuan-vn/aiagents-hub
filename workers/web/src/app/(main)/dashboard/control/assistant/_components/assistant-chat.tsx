"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type ChatStatus } from "ai";
import { Loader2, SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { CreateApiKeyToolView, CreateOrderToolView } from "./assistant-tool-views";
import type { AssistantUIMessage } from "./assistant-types";

function describeBackendActivity(status: ChatStatus, messages: AssistantUIMessage[]): string {
  if (status === "error") return "Có lỗi khi gọi auth-worker /dashboard/assistant/chat.";
  if (status === "submitted") return "Đang gửi tin nhắn tới auth-worker /dashboard/assistant/chat…";

  if (status === "streaming" || status === "ready") {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && (last.parts?.length ?? 0) > 0) {
      const parts = last.parts ?? [];
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (!isToolUIPart(part)) continue;
        if (part.type === "tool-createApiKey") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return "Model đang chọn tham số tạo API key → sẽ gọi auth-worker /dashboard/token/create.";
          }
          if (part.state === "output-available") {
            const out = part.output as { state?: string } | undefined;
            if (out && "state" in out && out.state === "loading") {
              return "Backend: đang gọi auth-worker POST /dashboard/token/create (tạo API key)…";
            }
          }
        }
        if (part.type === "tool-createOrder") {
          if (part.state === "input-streaming" || part.state === "input-available") {
            return "Model đang chọn tham số đơn hàng → sẽ gọi auth-worker /dashboard/order/orders.";
          }
          if (part.state === "output-available") {
            const out = part.output as { state?: string } | undefined;
            if (out && "state" in out && out.state === "loading") {
              return "Backend: đang gọi auth-worker POST /dashboard/order/orders (tạo đơn)…";
            }
          }
        }
      }
    }
  }

  if (status === "streaming") return "Auth-worker assistant đang stream phản hồi (Workers AI + tools)…";
  return "";
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
        <span className="min-w-0 flex-1">
          {activity || t("activity_idle")}
        </span>
      </div>

      {error ? (
        <p className="text-destructive text-sm">
          {error.message}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border p-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-2">
              <div className="text-muted-foreground text-xs font-medium uppercase">{message.role}</div>
              <div className="space-y-2 pl-0">
                {(message.parts ?? []).map((part, index) => {
                  const key = `${message.id}-${index}`;
                  if (part.type === "text") {
                    return (
                      <p key={key} className="text-sm whitespace-pre-wrap">
                        {part.text}
                      </p>
                    );
                  }
                  if (part.type === "step-start") {
                    return index > 0 ? <hr key={key} className="border-muted my-2" /> : null;
                  }
                  if (part.type === "tool-createApiKey") {
                    return <CreateApiKeyToolView key={key} part={part} />;
                  }
                  if (part.type === "tool-createOrder") {
                    return <CreateOrderToolView key={key} part={part} />;
                  }
                  return null;
                })}
              </div>
            </div>
          ))
        )}
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
