"use client";

import * as React from "react";

import { Bot, Paperclip, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { codebaseContext } from "../_data/codebase-context";

import { ChatMessage } from "./chat-message";
import { FeatureTree } from "./feature-tree";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "form" | "table" | "chart" | "multidim";
  payload?: unknown;
  timestamp: Date;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export function AskAiChat() {
  const [messages, setMessages] = React.useState<ChatMessageData[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string, selectedFeatureId?: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: selectedFeatureId
        ? `[${codebaseContext.features.find((f) => f.id === selectedFeatureId)?.name}] ${trimmed}`
        : trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE_URL}/dashboard/ask-ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: userMsg.content,
          history: history.slice(-10),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        content?: string;
        type?: string;
        payload?: unknown;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      const validTypes = ["text", "form", "table", "chart", "multidim"] as const;
      const msgType =
        data.type && validTypes.includes(data.type as (typeof validTypes)[number])
          ? (data.type as (typeof validTypes)[number])
          : "text";
      const assistantMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.content ?? "Sorry, I couldn't process that.",
        type: msgType,
        payload: data.payload ?? null,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Đã xảy ra lỗi. Vui lòng thử lại.",
        type: "text",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleFeatureSelect = (featureId: string) => {
    const feature = codebaseContext.features.find((f) => f.id === featureId);
    if (feature) {
      setInput(feature.description);
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Chat area - 70% */}
      <div className="flex min-w-0 flex-[7] flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="bg-primary/10 rounded-full p-4">
                <Bot className="text-primary size-10" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Ask AI</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Tôi có thể giúp bạn tạo đơn hàng, xem thống kê, logs, API keys và nhiều hơn nữa.
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  Thử: &quot;Tạo đơn hàng mới&quot; hoặc &quot;Xem thống kê doanh thu tháng này&quot;
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onApiSuccess={(result) => setMessages((prev) => [...prev, result])}
                />
              ))}
              {isLoading && (
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Bot className="text-primary size-4" />
                  </div>
                  <div className="flex gap-1 pt-1">
                    <span className="bg-muted size-2 animate-bounce rounded-full" style={{ animationDelay: "0ms" }} />
                    <span className="bg-muted size-2 animate-bounce rounded-full" style={{ animationDelay: "150ms" }} />
                    <span className="bg-muted size-2 animate-bounce rounded-full" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi hoặc yêu cầu..."
              className="max-h-32 min-h-[44px] resize-none"
              rows={1}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
            />
            <Button type="button" variant="outline" size="icon" className="shrink-0" title="Đính kèm">
              <Paperclip className="size-4" />
            </Button>
            <Button type="submit" size="icon" className="shrink-0" disabled={isLoading || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* Sidebar - 30% */}
      <div className="flex min-w-[200px] flex-[3] flex-col overflow-hidden border-l">
        <FeatureTree features={codebaseContext.features} onSelect={handleFeatureSelect} />
      </div>
    </div>
  );
}
