"use client";

import { useSyncExternalStore } from "react";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ChatTriggerConversation } from "../chat/chat-trigger-conversation";
import { getWorkflowExecution } from "../../_lib/api";

import { workflowEditorChatStore } from "./workflow-editor-chat-store";
import { workflowEditorLogsStore } from "./workflow-editor-logs-store";

interface WorkflowEditorChatPanelProps {
  workflowId: number;
  className?: string;
}

export function WorkflowEditorChatPanel({ workflowId, className }: WorkflowEditorChatPanelProps) {
  const t = useTranslations("WorkflowEditorPage");
  const chat = useSyncExternalStore(
    workflowEditorChatStore.subscribe,
    workflowEditorChatStore.getState,
    workflowEditorChatStore.getState,
  );

  if (!chat.open || chat.workflowId !== workflowId || !chat.endpointUrl) return null;

  const sessionShort = chat.sessionId ? chat.sessionId.slice(0, 8) : "";

  return (
    <div className={cn("border-border bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r", className)}>
      <ChatTriggerConversation
        endpointUrl={chat.endpointUrl}
        sessionId={chat.sessionId}
        initialMessages={chat.initialMessages}
        inputPlaceholder={chat.inputPlaceholder}
        messages={chat.messages}
        onMessagesChange={workflowEditorChatStore.setMessages}
        sending={chat.sending}
        onSendingChange={workflowEditorChatStore.setSending}
        onSendStart={() => {
          if (chat.nodeId) workflowEditorLogsStore.startRun(workflowId, chat.nodeId);
        }}
        onReply={async (result) => {
          if (!result.executionKey) {
            workflowEditorLogsStore.finishRun(workflowId);
            return;
          }
          try {
            const { execution } = await getWorkflowExecution(result.executionKey);
            workflowEditorLogsStore.finishRun(workflowId, execution.steps);
          } catch {
            workflowEditorLogsStore.finishRun(workflowId);
          }
        }}
        header={
          <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
            <MessageCircle className="size-3.5 text-[#ff6f00]" aria-hidden />
            <span className="text-xs font-medium">{t("chat_panel_title")}</span>
            {sessionShort ? (
              <span className="text-muted-foreground truncate font-mono text-[11px]">
                {t("chat_session", { id: sessionShort })}
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => workflowEditorChatStore.hide()}
            >
              {t("chat_hide")}
            </Button>
          </div>
        }
      />
    </div>
  );
}
