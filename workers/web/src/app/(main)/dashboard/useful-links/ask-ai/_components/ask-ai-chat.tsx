"use client";

import * as React from "react";

import { Bot, Send, Sparkles } from "lucide-react";

import { useDashboardUser } from "@/app/(main)/dashboard/_context/dashboard-user-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useWs } from "@/core/use-ws";

import { AskAiInlineActivity } from "./ask-ai-inline-activity";
import { mergeServerStep, type ActivityStep } from "./ask-ai-steps";
import { ChatMessage } from "./chat-message";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "form" | "table" | "chart" | "multidim";
  payload?: unknown;
  /** Nút mở màn hình dashboard trong panel (từ tool AI + server). */
  suggestedActions?: Array<{ label: string; path: string }>;
  timestamp: Date;
}

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.unitoken.trade";

export function AskAiChat() {
  const user = useDashboardUser();
  const [messages, setMessages] = React.useState<ChatMessageData[]>([]);
  const [input, setInput] = React.useState("");
  const [panelPath, setPanelPath] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activitySteps, setActivitySteps] = React.useState<ActivityStep[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const wasLoadingRef = React.useRef(false);
  const requestIdRef = React.useRef<string | null>(null);

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
    if (wasLoadingRef.current && !isLoading) {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;

    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setActivitySteps([
      { id: "client", label: "Đã gửi tới máy chủ", status: "done", at: Date.now() },
      { id: "receive", label: "Đang chờ xác nhận…", status: "running", at: Date.now() },
    ]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE_URL}/dashboard/ask-ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: userMsg.content,
          history: history.slice(-10),
          requestId,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        content?: string;
        type?: string;
        payload?: unknown;
        suggestedActions?: Array<{ label: string; path: string }>;
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
        suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions : undefined,
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
      setActivitySteps((prev) =>
        mergeServerStep(prev, { stepId: "error", label: "Có lỗi khi xử lý yêu cầu", status: "error" }),
      );
    } finally {
      setIsLoading(false);
      window.setTimeout(() => {
        if (requestIdRef.current === requestId) requestIdRef.current = null;
      }, 2500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const wsReady = Boolean(user?.identifier);
  const isAdmin = user?.role === "admin";
  const quickActions = React.useMemo(
    () => [...QUICK_ACTIONS_MEMBER, ...(isAdmin ? QUICK_ACTIONS_ADMIN : [])],
    [isAdmin],
  );

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
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onApiSuccess={(result) => setMessages((prev) => [...prev, result])}
                  onOpenInPanel={(path) => setPanelPath(path)}
                />
              ))}
              {isLoading && (
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
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-xl shadow-sm"
              disabled={isLoading || !input.trim()}
              aria-label="Gửi"
            >
              <Send className="size-4" />
            </Button>
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
