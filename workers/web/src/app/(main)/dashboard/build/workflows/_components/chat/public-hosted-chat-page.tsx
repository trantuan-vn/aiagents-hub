"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ChatTriggerConversation,
  newChatSessionId,
  seedChatTriggerMessages,
  type ChatTriggerMessage,
} from "@/app/(main)/dashboard/build/workflows/_components/chat/chat-trigger-conversation";
import { buildChatApiUrl } from "@/app/(main)/dashboard/build/workflows/_components/panels/node-config/chat-url";

type PublicChatMode = "test" | "production";

type ChatMeta = {
  title?: string;
  subtitle?: string;
  initialMessages?: string;
  inputPlaceholder?: string;
};

export function PublicHostedChatPage({
  workflowId,
  chatPath,
  ownerId,
  mode,
}: {
  workflowId: number;
  chatPath: string;
  ownerId?: string;
  mode: PublicChatMode;
}) {
  const t = useTranslations("WorkflowEditorPage");
  const endpointUrl = useMemo(
    () => buildChatApiUrl({ workflowId, chatPath, mode, ownerId }),
    [workflowId, chatPath, mode, ownerId],
  );
  const [sessionId] = useState(newChatSessionId);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatTriggerMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(endpointUrl);
    url.searchParams.set("format", "json");
    void (async () => {
      try {
        const res = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          setError(String(data.error ?? t("chat_unavailable")));
          setLoading(false);
          return;
        }
        const nextMeta: ChatMeta = {
          title: typeof data.title === "string" ? data.title : undefined,
          subtitle: typeof data.subtitle === "string" ? data.subtitle : undefined,
          initialMessages: typeof data.initialMessages === "string" ? data.initialMessages : undefined,
          inputPlaceholder: typeof data.inputPlaceholder === "string" ? data.inputPlaceholder : undefined,
        };
        setMeta(nextMeta);
        setMessages(seedChatTriggerMessages(nextMeta.initialMessages));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(t("chat_unavailable"));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpointUrl, t]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-full min-h-screen items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t("chat_loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center px-4">
        <div className="bg-background max-w-md rounded-xl border p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold">{t("chat_unavailable_title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  const sessionShort = sessionId.slice(0, 8);

  return (
    <div className="bg-muted/40 flex h-svh min-h-0 flex-col">
      <ChatTriggerConversation
        className="mx-auto w-full max-w-3xl border-x bg-transparent"
        endpointUrl={endpointUrl}
        sessionId={sessionId}
        initialMessages={meta?.initialMessages}
        inputPlaceholder={meta?.inputPlaceholder}
        messages={messages}
        onMessagesChange={setMessages}
        sending={sending}
        onSendingChange={setSending}
        header={
          <div className="bg-background flex shrink-0 flex-col gap-0.5 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">{meta?.title || t("chat_panel_title")}</h1>
              <span className="text-muted-foreground ml-auto font-mono text-[11px]">
                {t("chat_session", { id: sessionShort })}
              </span>
            </div>
            {meta?.subtitle ? <p className="text-muted-foreground text-xs">{meta.subtitle}</p> : null}
          </div>
        }
      />
    </div>
  );
}
