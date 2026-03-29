"use client";

import * as React from "react";

import { Bot, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import type { ChatMessageData } from "./ask-ai-chat";
import { MessageChart } from "./message-chart";
import { MessageForm } from "./message-form";
import { MessageMultidim } from "./message-multidim";
import { MessageTable } from "./message-table";

interface ChatMessageProps {
  message: ChatMessageData;
  onApiSuccess?: (result: ChatMessageData) => void;
  onOpenInPanel?: (path: string) => void;
}

function AssistantBlocks({ message, onApiSuccess, onOpenInPanel }: ChatMessageProps) {
  const actions = message.suggestedActions;
  const toolLines = message.toolProgressLines;
  return (
    <>
      {toolLines && toolLines.length > 0 ? (
        <ul className="border-border/50 bg-muted/30 text-muted-foreground mb-1 rounded-xl border px-3 py-2 text-xs leading-relaxed">
          {toolLines.map((line, i) => (
            <li key={`${line}-${i}`} className="flex gap-2">
              <span className="text-primary shrink-0">→</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {message.content && (
        <p className="border-border/60 bg-card/90 text-foreground rounded-2xl border px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
          {message.content}
        </p>
      )}
      {actions && actions.length > 0 && onOpenInPanel ? (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {actions.map((a) => (
            <Button
              key={`${a.path}-${a.label}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => onOpenInPanel(a.path)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
      {message.type === "form" && message.payload && <MessageForm payload={message.payload} onSuccess={onApiSuccess} />}
      {message.type === "table" && message.payload && <MessageTable payload={message.payload} />}
      {message.type === "chart" && message.payload && <MessageChart payload={message.payload} />}
      {message.type === "multidim" && message.payload && <MessageMultidim payload={message.payload} />}
    </>
  );
}

export function ChatMessage({ message, onApiSuccess, onOpenInPanel }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("group flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/12 text-primary",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn("flex max-w-[min(85%,42rem)] min-w-0 flex-1 flex-col gap-2", isUser && "items-end")}>
        {isUser ? (
          <p className="bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm">
            {message.content}
          </p>
        ) : (
          <AssistantBlocks message={message} onApiSuccess={onApiSuccess} onOpenInPanel={onOpenInPanel} />
        )}
      </div>
    </div>
  );
}
