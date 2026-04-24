"use client";

import { type ReactNode } from "react";

import { isToolUIPart, type ChatStatus } from "ai";
import { useTranslations } from "next-intl";

import {
  CreateApiKeyToolView,
  CreateOrderToolView,
  CreatePaymentUrlToolView,
} from "./assistant-tool-views";
import type { AssistantUIMessage } from "./assistant-types";

export const URL_REGEX = /(https?:\/\/[^\s<>"'`]+)/gi;
export const CONFIRM_APPROVE_TOKEN = "__assistant_confirm_ok__";
export const CONFIRM_CANCEL_TOKEN = "__assistant_confirm_cancel__";
export const CONFIRM_REQUIRED_TOKEN = "__assistant_confirm_required__";
export const CONFIRM_SEPARATOR = "::";

type AssistantMessagePart = NonNullable<AssistantUIMessage["parts"]>[number];
type AssistantTranslations = ReturnType<typeof useTranslations<"AssistantPage">>;

type ConfirmationRequiredOutput = {
  state: unknown;
  confirmationKey?: unknown;
};

function isLoadingToolOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || !("state" in output)) return false;
  return (output as { state: unknown }).state === "loading";
}

function describeCreateApiKeyTool(
  part: Extract<AssistantMessagePart, { type: "tool-createApiKey" }>,
  t: AssistantTranslations,
): string | null {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return t("activity.create_api_key_input");
  }
  if (part.state === "output-available" && isLoadingToolOutput(part.output)) {
    return t("activity.create_api_key_loading");
  }
  return null;
}

function describeCreateOrderTool(
  part: Extract<AssistantMessagePart, { type: "tool-createOrder" }>,
  t: AssistantTranslations,
): string | null {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return t("activity.create_order_input");
  }
  if (part.state === "output-available" && isLoadingToolOutput(part.output)) {
    return t("activity.create_order_loading");
  }
  return null;
}

function describeToolPartActivity(part: AssistantMessagePart, t: AssistantTranslations): string | null {
  if (!isToolUIPart(part)) return null;
  if (part.type === "tool-createApiKey") return describeCreateApiKeyTool(part, t);
  if (part.type === "tool-createOrder") return describeCreateOrderTool(part, t);
  if (part.type === "tool-createPaymentUrl") {
    if (part.state === "input-streaming" || part.state === "input-available") {
      return t("activity.create_payment_url_input");
    }
    if (part.state === "output-available" && isLoadingToolOutput(part.output)) {
      return t("activity.create_payment_url_loading");
    }
  }
  return null;
}

function describeActivityFromLastAssistantMessage(
  messages: AssistantUIMessage[],
  t: AssistantTranslations,
): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || last.parts.length === 0) return null;
  const parts = last.parts;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts.at(i);
    if (!part) continue;
    const line = describeToolPartActivity(part, t);
    if (line) return line;
  }
  return null;
}

export function describeBackendActivity(
  status: ChatStatus,
  messages: AssistantUIMessage[],
  t: AssistantTranslations,
): string {
  if (status === "error") return t("activity.backend_error");
  if (status === "submitted") return t("activity.submitted");

  const fromParts = describeActivityFromLastAssistantMessage(messages, t);
  if (fromParts) return fromParts;

  if (status === "streaming") return t("activity.streaming");
  return "";
}

function getLatestAssistantText(messages: AssistantUIMessage[]): string {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return "";
  return last.parts.map((part) => (part.type === "text" ? part.text : "")).filter(Boolean).join("\n").trim();
}

function extractConfirmationKey(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const candidate = output as ConfirmationRequiredOutput;
  if (candidate.state !== "confirmation-required") return null;
  if (typeof candidate.confirmationKey === "string") return candidate.confirmationKey.trim();
  return "";
}

export function getPendingConfirmationKey(messages: AssistantUIMessage[]): string | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return null;

  for (const part of last.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const key = extractConfirmationKey(part.output);
    if (key !== null) return key;
  }

  return null;
}

export function shouldShowConfirmationActions(status: ChatStatus, messages: AssistantUIMessage[]): boolean {
  if (status !== "ready") return false;
  if (getPendingConfirmationKey(messages) !== null) return true;

  const lastText = getLatestAssistantText(messages);
  if (!lastText) return false;
  return lastText.includes(CONFIRM_REQUIRED_TOKEN);
}

function renderTextWithLinks(text: string) {
  const matches = Array.from(text.matchAll(URL_REGEX));
  if (matches.length === 0) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const url = match[0];
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + url.length;

    if (start > cursor) {
      nodes.push(<span key={`text-${cursor}-${start}`}>{text.slice(cursor, start)}</span>);
    }

    nodes.push(
      <a
        key={`url-${start}-${end}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary break-all underline underline-offset-2"
      >
        {url}
      </a>,
    );
    cursor = end;
  }

  if (cursor < text.length) {
    nodes.push(<span key={`text-${cursor}-${text.length}`}>{text.slice(cursor)}</span>);
  }

  return nodes;
}

function toDisplayText(text: string, t: AssistantTranslations): string {
  const trimmed = text.trim();
  if (trimmed === CONFIRM_APPROVE_TOKEN || trimmed.startsWith(`${CONFIRM_APPROVE_TOKEN}${CONFIRM_SEPARATOR}`)) {
    return t("confirmation_actions.ok_label");
  }
  if (trimmed === CONFIRM_CANCEL_TOKEN) return t("confirmation_actions.cancel_label");
  return text.replaceAll(CONFIRM_REQUIRED_TOKEN, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function AssistantMessagePartView({
  index,
  part,
  t,
}: {
  index: number;
  part: AssistantMessagePart;
  t: AssistantTranslations;
}) {
  if (part.type === "text") {
    return (
      <p className="text-sm break-words whitespace-pre-wrap">{renderTextWithLinks(toDisplayText(part.text, t))}</p>
    );
  }
  if (part.type === "step-start") {
    return index > 0 ? <hr className="border-muted my-2" /> : null;
  }
  if (part.type === "tool-createApiKey") {
    return <CreateApiKeyToolView part={part} />;
  }
  if (part.type === "tool-createOrder") {
    return <CreateOrderToolView part={part} />;
  }
  if (part.type === "tool-createPaymentUrl") {
    return <CreatePaymentUrlToolView part={part} />;
  }
  return null;
}

export function AssistantMessagesList({
  emptyLabel,
  messages,
  t,
}: {
  emptyLabel: string;
  messages: AssistantUIMessage[];
  t: AssistantTranslations;
}) {
  if (messages.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }
  return messages.map((message) => (
    <div key={message.id} className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium uppercase">{message.role}</div>
      <div className="space-y-2 pl-0">
        {message.parts.map((part, index) => (
          // eslint-disable-next-line react/no-array-index-key -- SDK parts are ordered; not all part kinds expose stable ids
          <AssistantMessagePartView key={`${message.id}-${index}`} index={index} part={part} t={t} />
        ))}
      </div>
    </div>
  ));
}
