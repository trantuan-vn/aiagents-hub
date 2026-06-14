"use client";

import { useMemo, useState, type FormEvent } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Loader2, SendHorizontal, Sparkles, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { AssistantMessagesList } from "@/app/(main)/dashboard/control/assistant/_components/assistant-chat-helpers";
import type { AssistantUIMessage } from "@/app/(main)/dashboard/control/assistant/_components/assistant-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface WorkflowChatProps {
  workflowId: number;
  ownerId?: string;
  workflowName?: string;
  variant?: "default" | "sidebar";
  mode?: "ask" | "build";
}

interface WorkflowChatViewProps extends WorkflowChatProps {
  messages: AssistantUIMessage[];
  sendMessage: (message: { text: string }) => void;
  stop: () => void;
  error: Error | undefined;
  isBusy: boolean;
  text: string;
  setText: (value: string) => void;
  canSend: boolean;
  onSubmit: (e: FormEvent) => void;
}

function useWorkflowChat(workflowId: number, ownerId?: string) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://api.aiagents-hub.vn";

  const chatUrl = useMemo(() => {
    if (ownerId) {
      return `${apiBaseUrl}/dashboard/build/workflows/shared/${ownerId}/${workflowId}/chat`;
    }
    return `${apiBaseUrl}/dashboard/build/workflows/${workflowId}/chat`;
  }, [apiBaseUrl, workflowId, ownerId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatUrl,
        credentials: "include",
      }),
    [chatUrl],
  );

  return useChat<AssistantUIMessage>({ transport });
}

function WorkflowChatSidebar({
  messages,
  stop,
  error,
  isBusy,
  text,
  setText,
  canSend,
  onSubmit,
  mode = "ask",
}: WorkflowChatViewProps) {
  const t = useTranslations("WorkflowChatPage");
  const tAssistant = useTranslations("AssistantPage");
  const te = useTranslations("WorkflowEditorPage");
  const placeholder = mode === "build" ? te("ai_placeholder_build") : te("ai_placeholder_ask");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {messages.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
            <Sparkles className="size-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">{te("ai_empty_title")}</p>
            <p className="mt-1 text-xs leading-relaxed">{te("ai_empty_description")}</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
          {error ? <p className="text-destructive text-xs">{error.message}</p> : null}
          <AssistantMessagesList emptyLabel={t("empty")} messages={messages} t={tAssistant} />
        </div>
      )}

      {isBusy ? (
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {t("thinking")}
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={() => stop()}>
            <Square className="mr-1 size-3" />
            {t("stop")}
          </Button>
        </div>
      ) : null}

      <form className="relative mt-auto shrink-0" onSubmit={onSubmit}>
        <Textarea
          className="min-h-[72px] resize-none rounded-xl pr-12 text-sm"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit(e);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          className="absolute right-2 bottom-2 size-8 rounded-lg bg-[#ff6f00] text-white hover:bg-[#e66300]"
        >
          <ArrowUp className="size-4" />
          <span className="sr-only">{t("send")}</span>
        </Button>
      </form>
    </div>
  );
}

function WorkflowChatDefault({
  workflowName,
  messages,
  stop,
  error,
  isBusy,
  text,
  setText,
  canSend,
  onSubmit,
}: WorkflowChatViewProps) {
  const t = useTranslations("WorkflowChatPage");
  const tAssistant = useTranslations("AssistantPage");

  return (
    <div className="flex h-[min(720px,calc(100vh-12rem))] flex-col gap-4">
      {workflowName ? (
        <p className="text-muted-foreground text-sm">{t("chatting_with", { name: workflowName })}</p>
      ) : null}

      <div className="bg-muted/40 text-muted-foreground flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <Loader2 className={`h-4 w-4 shrink-0 ${isBusy ? "animate-spin" : "opacity-40"}`} />
        <span className="min-w-0 flex-1">{isBusy ? t("thinking") : t("ready")}</span>
      </div>

      {error ? <p className="text-destructive text-sm">{error.message}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border p-4">
        <AssistantMessagesList emptyLabel={t("empty")} messages={messages} t={tAssistant} />
      </div>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onSubmit}>
        <Textarea
          className="min-h-[88px] flex-1 resize-y"
          placeholder={t("placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex shrink-0 gap-2 sm:flex-col">
          {isBusy && (
            <Button type="button" variant="outline" onClick={() => stop()}>
              <Square className="mr-2 h-4 w-4" />
              {t("stop")}
            </Button>
          )}
          <Button type="submit" disabled={!canSend}>
            <SendHorizontal className="mr-2 h-4 w-4" />
            {t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function WorkflowChat({
  workflowId,
  ownerId,
  workflowName,
  variant = "default",
  mode = "ask",
}: WorkflowChatProps) {
  const [text, setText] = useState("");
  const { messages, sendMessage, status, stop, error } = useWorkflowChat(workflowId, ownerId);

  const isBusy = status === "streaming" || status === "submitted";
  const canSend = !isBusy && Boolean(text.trim());

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void sendMessage({ text });
    setText("");
  };

  const viewProps: WorkflowChatViewProps = {
    workflowId,
    ownerId,
    workflowName,
    variant,
    mode,
    messages,
    sendMessage,
    stop,
    error,
    isBusy,
    text,
    setText,
    canSend,
    onSubmit,
  };

  if (variant === "sidebar") {
    return <WorkflowChatSidebar {...viewProps} />;
  }

  return <WorkflowChatDefault {...viewProps} />;
}
