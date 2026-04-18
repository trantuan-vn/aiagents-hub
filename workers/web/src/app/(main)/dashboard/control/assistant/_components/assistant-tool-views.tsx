"use client";

import type { AssistantUIMessage } from "./assistant-types";

type CreateApiKeyPart = Extract<AssistantUIMessage["parts"][number], { type: "tool-createApiKey" }>;
type CreateOrderPart = Extract<AssistantUIMessage["parts"][number], { type: "tool-createOrder" }>;

type ApiKeyOutput =
  | { state: "loading" }
  | { state: "ready"; ok: boolean; status?: number; error?: string; body?: unknown };

type OrderOutput =
  | { state: "loading" }
  | { state: "ready"; ok: boolean; status?: number; error?: string; body?: unknown };

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function CreateApiKeyToolView({ part }: { part: CreateApiKeyPart }) {
  switch (part.state) {
    case "input-streaming":
      return <JsonBlock value={part.input} />;
    case "input-available": {
      const { input } = part;
      return (
        <p className="text-muted-foreground text-sm">
          Chuẩn bị tạo API key: <span className="text-foreground font-medium">{input.name}</span>
        </p>
      );
    }
    case "output-available": {
      const out = part.output as ApiKeyOutput;
      if (out.state === "loading") {
        return (
          <p className="text-muted-foreground text-sm">
            Đang gọi auth-worker <code className="text-xs">POST /dashboard/token/create</code>…
          </p>
        );
      }
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">{out.ok ? "Đã tạo API key" : "Tạo API key thất bại"}</p>
          <JsonBlock value={out.body ?? out.error} />
        </div>
      );
    }
    case "output-error":
      return <p className="text-destructive text-sm">Lỗi: {part.errorText}</p>;
    default:
      return null;
  }
}

export function CreateOrderToolView({ part }: { part: CreateOrderPart }) {
  switch (part.state) {
    case "input-streaming":
      return <JsonBlock value={part.input} />;
    case "input-available": {
      const { input } = part;
      return <p className="text-muted-foreground text-sm">Chuẩn bị tạo đơn hàng với {input.items.length} dòng hàng…</p>;
    }
    case "output-available": {
      const out = part.output as OrderOutput;
      if (out.state === "loading") {
        return (
          <p className="text-muted-foreground text-sm">
            Đang gọi auth-worker <code className="text-xs">POST /dashboard/order/orders</code>…
          </p>
        );
      }
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">{out.ok ? "Đã tạo đơn hàng" : "Tạo đơn hàng thất bại"}</p>
          <JsonBlock value={out.body ?? out.error} />
        </div>
      );
    }
    case "output-error":
      return <p className="text-destructive text-sm">Lỗi: {part.errorText}</p>;
    default:
      return null;
  }
}
