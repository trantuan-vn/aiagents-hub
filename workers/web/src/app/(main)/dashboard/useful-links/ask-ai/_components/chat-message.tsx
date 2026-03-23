"use client";

import * as React from "react";

import { Bot, User } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ChatMessageData } from "./ask-ai-chat";
import { MessageChart } from "./message-chart";
import { MessageForm } from "./message-form";
import { MessageMultidim } from "./message-multidim";
import { MessageTable } from "./message-table";

interface ChatMessageProps {
  message: ChatMessageData;
  onApiSuccess?: (result: ChatMessageData) => void;
}

function AssistantBlocks({ message, onApiSuccess }: ChatMessageProps) {
  return (
    <>
      {message.content && (
        <p className="bg-muted rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">{message.content}</p>
      )}
      {message.type === "form" && message.payload && <MessageForm payload={message.payload} onSuccess={onApiSuccess} />}
      {message.type === "table" && message.payload && <MessageTable payload={message.payload} />}
      {message.type === "chart" && message.payload && <MessageChart payload={message.payload} />}
      {message.type === "multidim" && message.payload && <MessageMultidim payload={message.payload} />}
    </>
  );
}

export function ChatMessage({ message, onApiSuccess }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn("flex max-w-[85%] min-w-0 flex-1 flex-col gap-2", isUser && "items-end")}>
        {isUser ? (
          <p className="bg-muted rounded-lg px-3 py-2 text-sm">{message.content}</p>
        ) : (
          <AssistantBlocks message={message} onApiSuccess={onApiSuccess} />
        )}
      </div>
    </div>
  );
}
