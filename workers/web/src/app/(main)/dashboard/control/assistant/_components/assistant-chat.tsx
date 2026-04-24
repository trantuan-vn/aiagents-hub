"use client";

import { useMemo, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  AssistantMessagesList,
  CONFIRM_APPROVE_TOKEN,
  CONFIRM_CANCEL_TOKEN,
  CONFIRM_SEPARATOR,
  describeBackendActivity,
  getPendingConfirmationKey,
  shouldShowConfirmationActions,
} from "./assistant-chat-helpers";
import type { AssistantUIMessage } from "./assistant-types";

type AssistantTranslations = ReturnType<typeof useTranslations<"AssistantPage">>;

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

  const isBusy = status === "streaming" || status === "submitted";
  const activity = describeBackendActivity(status, messages, t);
  const pendingConfirmationKey = getPendingConfirmationKey(messages);
  const showConfirmationActions = shouldShowConfirmationActions(status, messages);
  const canSend = !isBusy && Boolean(text.trim());
  const sendConfirmation = (value: "ok" | "cancel") => {
    const payload =
      value === "ok"
        ? pendingConfirmationKey
          ? `${CONFIRM_APPROVE_TOKEN}${CONFIRM_SEPARATOR}${pendingConfirmationKey}`
          : CONFIRM_APPROVE_TOKEN
        : CONFIRM_CANCEL_TOKEN;
    void sendMessage({ text: payload });
  };

  return (
    <div className="flex h-[min(720px,calc(100vh-12rem))] flex-col gap-4">
      <div className="bg-muted/40 text-muted-foreground flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <Loader2 className={`h-4 w-4 shrink-0 ${isBusy ? "animate-spin" : "opacity-40"}`} />
        <span className="min-w-0 flex-1">{activity || t("activity_idle")}</span>
      </div>

      {error ? <p className="text-destructive text-sm">{error.message}</p> : null}

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
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => stop()}>
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
