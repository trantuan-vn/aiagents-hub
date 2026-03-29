"use client";

import * as React from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send, Sparkles, Square } from "lucide-react";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useWs } from "@/core/use-ws";

import {
  getQuickActions,
  uiMessageToChatMessageData,
  type AskAiUIMessage,
  type ChatMessageData,
} from "./ask-ai-chat-utils";
import { AskAiInlineActivity } from "./ask-ai-inline-activity";
import { mergeServerStep, type ActivityStep } from "./ask-ai-steps";
import { ChatMessage } from "./chat-message";

export type { ChatMessageData, AskAiUIMessage };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export function AskAiChat() {
  const user = useDashboardUser();
  const [input, setInput] = React.useState("");
  const [panelPath, setPanelPath] = React.useState<string | null>(null);
  const [activitySteps, setActivitySteps] = React.useState<ActivityStep[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const wasBusyRef = React.useRef(false);
  const requestIdRef = React.useRef<string | null>(null);

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<AskAiUIMessage>({
        api: `${API_BASE_URL}/dashboard/ask-ai/chat`,
        credentials: "include",
        prepareSendMessagesRequest: ({
          id,
          messages,
          body,
        }: {
          id: string;
          messages: AskAiUIMessage[];
          body: Record<string, unknown> | undefined;
        }) => {
          const requestId = crypto.randomUUID();
          requestIdRef.current = requestId;
          return {
            body: {
              messages,
              id,
              requestId,
              ...(body && typeof body === "object" ? body : {}),
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat<AskAiUIMessage>({
    id: "ask-ai-dashboard",
    transport,
  });

  const isBusy = status === "streaming" || status === "submitted";

  const wsHandlers = React.useMemo(
    () => ({
      broadcast(data: unknown) {
        if (typeof data !== "object" || data === null) return;
        const o = data as {
          data?: { channel?: string; requestId?: string; stepId?: string; label?: string; status?: string };
        };
        const d = o.data;
        if (d?.channel !== "ask-ai" || d.requestId !== requestIdRef.current) return;
        if (!d.stepId || !d.label) return;
        setActivitySteps((prev) =>
          mergeServerStep(prev, {
            stepId: d.stepId!,
            label: d.label!,
            status: d.status ?? "running",
          }),
        );
      },
    }),
    [],
  );

  useWs(user?.identifier ? { identifier: user.identifier } : null, wsHandlers);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activitySteps]);

  React.useEffect(() => {
    if (wasBusyRef.current && !isBusy) {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
    wasBusyRef.current = isBusy;
  }, [isBusy]);

  React.useEffect(() => {
    if (!isBusy) return;
    setActivitySteps([
      { id: "client", label: "Đã gửi tới máy chủ", status: "done", at: Date.now() },
      { id: "receive", label: "Đang chờ xác nhận…", status: "running", at: Date.now() },
    ]);
  }, [isBusy]);

  const sendUserMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setInput("");
    await sendMessage({ text: trimmed });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendUserMessage(input);
  };

  const wsReady = Boolean(user?.identifier);
  const isAdmin = user?.role === "admin";
  const quickActions = React.useMemo(() => getQuickActions(isAdmin), [isAdmin]);

  const displayMessages: ChatMessageData[] = React.useMemo(() => {
    const lastAssistantIndex = [...messages]
      .map((m: AskAiUIMessage, i: number) => (m.role === "assistant" ? i : -1))
      .filter((i: number) => i >= 0)
      .pop();

    return messages.map((m: AskAiUIMessage, index: number) =>
      uiMessageToChatMessageData(m, {
        isLastAssistant: m.role === "assistant" && index === lastAssistantIndex,
        chatStatus: status,
      }),
    );
  }, [messages, status]);

  return (
    <div className="from-background via-background to-muted/20 flex h-full min-h-0 w-full flex-col bg-gradient-to-b">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
          <div className="bg-primary/15 flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Bot className="text-primary size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Ask AI</h2>
            <p className="text-muted-foreground text-xs">Trợ lý tích hợp APIHub — đơn hàng, thống kê, logs, API keys</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickActions.map((a) => (
                <Button
                  key={a.path}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 rounded-full text-xs"
                  onClick={() => setPanelPath(a.path)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-12 text-center sm:py-20">
              <div className="from-primary/20 to-primary/5 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-inner">
                <Sparkles className="text-primary size-8" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium tracking-tight">Bắt đầu cuộc trò chuyện</p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Mô tả ngắn gọn việc bạn cần — ví dụ tạo đơn, xem biểu đồ doanh thu, hoặc lọc logs theo ngày.
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {error ? <p className="text-destructive text-sm">{error.message || "Đã xảy ra lỗi."}</p> : null}
              {displayMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onApiSuccess={(result) => {
                    setMessages((prev: AskAiUIMessage[]) => [
                      ...prev,
                      {
                        id: result.id,
                        role: "assistant",
                        parts: [{ type: "text", text: result.content }],
                      },
                    ]);
                  }}
                  onOpenInPanel={(path) => setPanelPath(path)}
                />
              ))}
              {isBusy && (
                <div className="flex items-start gap-3">
                  <div className="bg-primary/12 flex size-9 shrink-0 items-center justify-center rounded-xl">
                    <Bot className="text-primary size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <AskAiInlineActivity steps={activitySteps} wsConnected={wsReady} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-background/95 supports-[backdrop-filter]:bg-background/80 border-t p-4 backdrop-blur md:px-6"
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập yêu cầu… (Enter gửi, Shift+Enter xuống dòng)"
              className="border-border/50 bg-card/50 focus-visible:ring-primary/40 max-h-36 min-h-[48px] resize-none rounded-xl py-3 shadow-sm"
              rows={1}
              disabled={isBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendUserMessage(input);
                }
              }}
            />
            {isBusy ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-12 w-12 shrink-0 rounded-xl shadow-sm"
                onClick={() => void stop()}
                aria-label="Dừng"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="h-12 w-12 shrink-0 rounded-xl shadow-sm"
                disabled={!input.trim()}
                aria-label="Gửi"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </form>
      </div>

      <Sheet open={Boolean(panelPath)} onOpenChange={(open) => !open && setPanelPath(null)}>
        <SheetContent
          side="right"
          className="flex h-full max-h-screen w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(100vw,720px)]"
        >
          <SheetHeader className="border-border shrink-0 border-b px-4 py-3">
            <SheetTitle className="text-sm font-medium">Màn hình nhanh</SheetTitle>
          </SheetHeader>
          {panelPath ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <iframe
                title="Dashboard panel"
                src={panelPath}
                className="border-border/60 h-full min-h-[min(70vh,800px)] w-full flex-1 border-0"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
