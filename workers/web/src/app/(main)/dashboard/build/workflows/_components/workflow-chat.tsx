"use client";

import { useMemo, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { AssistantMessagesList } from "@/app/(main)/dashboard/control/assistant/_components/assistant-chat-helpers";
import type { AssistantUIMessage } from "@/app/(main)/dashboard/control/assistant/_components/assistant-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface WorkflowChatProps {
  workflowId: number;
  ownerId?: string;
  workflowName?: string;
}

export function WorkflowChat({ workflowId, ownerId, workflowName }: WorkflowChatProps) {
  const t = useTranslations("WorkflowChatPage");
  const tAssistant = useTranslations("AssistantPage");
  const [text, setText] = useState("");
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

  const { messages, sendMessage, status, stop, error } = useChat<AssistantUIMessage>({ transport });

  const isBusy = status === "streaming" || status === "submitted";
  const canSend = !isBusy && Boolean(text.trim());

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
