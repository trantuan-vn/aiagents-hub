"use client";

import { useRef, useState } from "react";

import { Loader2, SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatRunStatus } from "../../../build/workflows/_components/chat/chat-trigger-conversation";
import type { ChatRunStep } from "../../../build/workflows/_components/chat/chat-run-log";

import {
  AssistantMessagesList,
  CONFIRM_APPROVE_TOKEN,
  CONFIRM_CANCEL_TOKEN,
  CONFIRM_SEPARATOR,
  getPendingConfirmationKey,
  shouldShowConfirmationActions,
} from "./assistant-chat-helpers";
import { postAssistantChat } from "./assistant-progress";
import type { AssistantUIMessage } from "./assistant-types";

type AssistantTranslations = ReturnType<typeof useTranslations<"AssistantPage">>;
type ChatStatus = "ready" | "submitted" | "error";

const SESSION_STORAGE_KEY = "dashboard-assistant-session";

function readSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

function textMessage(role: "user" | "assistant", text: string): AssistantUIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    parts: [{ type: "text", text }],
  };
}

function ConfirmationActions({
  disabled,
  onCancel,
  onConfirm,
  t,
}: {
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: AssistantTranslations;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">{t("confirmation_actions.prompt")}</span>
      <Button type="button" onClick={onConfirm} disabled={disabled}>
        {t("confirmation_actions.ok_label")}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
        {t("confirmation_actions.cancel_label")}
      </Button>
    </div>
  );
}

export function AssistantChat({ chatUrl }: { chatUrl: string | null }) {
  const t = useTranslations("AssistantPage");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AssistantUIMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [runSteps, setRunSteps] = useState<ChatRunStep[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const isBusy = status === "submitted";
  const pendingConfirmationKey = getPendingConfirmationKey(messages);
  const showConfirmationActions = shouldShowConfirmationActions(status, messages);
  const canSend = Boolean(chatUrl) && !isBusy && Boolean(text.trim());

  const sendChatInput = async (chatInput: string) => {
    if (!chatUrl) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("submitted");
    setError(null);
    setRunSteps([]);
    setMessages((current) => [...current, textMessage("user", chatInput)]);
    try {
      const result = await postAssistantChat({
        endpointUrl: chatUrl,
        sessionId: readSessionId(),
        chatInput,
        signal: controller.signal,
        onProgress: setRunSteps,
      });
      setMessages((current) => [...current, textMessage("assistant", result.output)]);
      setRunSteps([]);
      setStatus("ready");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setStatus("ready");
        return;
      }
      setError(cause instanceof Error ? cause.message : t("activity.backend_error"));
      setStatus("error");
    }
  };

  const sendConfirmation = (value: "ok" | "cancel") => {
    const payload =
      value === "ok"
        ? pendingConfirmationKey
          ? `${CONFIRM_APPROVE_TOKEN}${CONFIRM_SEPARATOR}${pendingConfirmationKey}`
          : CONFIRM_APPROVE_TOKEN
        : CONFIRM_CANCEL_TOKEN;
    void sendChatInput(payload);
  };

  return (
    <div className="flex h-[min(720px,calc(100vh-12rem))] flex-col gap-4">
      {isBusy ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">{t("activity_running")}</p>
          <ChatRunStatus steps={runSteps} />
        </div>
      ) : (
        <div className="bg-muted/40 text-muted-foreground flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 opacity-40" />
          <span className="min-w-0 flex-1">{error ? t("activity.backend_error") : t("activity_idle")}</span>
        </div>
      )}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {!chatUrl ? <p className="text-sm">{t("not_configured")}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border p-4">
        <AssistantMessagesList emptyLabel={t("empty")} messages={messages} t={t} />
      </div>

      {showConfirmationActions ? (
        <ConfirmationActions
          t={t}
          disabled={isBusy}
          onConfirm={() => sendConfirmation("ok")}
          onCancel={() => sendConfirmation("cancel")}
        />
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          const next = text;
          setText("");
          void sendChatInput(next);
        }}
      >
        <Textarea
          className="min-h-[88px] flex-1 resize-y"
          placeholder={t("placeholder")}
          value={text}
          disabled={!chatUrl}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex shrink-0 gap-2 sm:flex-col">
          {isBusy && (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => abortRef.current?.abort()}
            >
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
