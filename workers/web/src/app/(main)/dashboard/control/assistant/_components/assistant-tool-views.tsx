"use client";

import { formatUsd } from "@/lib/utils";

import type { AssistantUIMessage } from "./assistant-types";

const FALLBACK_USD_VND =
  Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000") > 0
    ? Number(process.env.NEXT_PUBLIC_USD_VND_RATE ?? "26000")
    : 26000;

type CreateApiKeyPart = Extract<AssistantUIMessage["parts"][number], { type: "tool-createApiKey" }>;
type CreateOrderPart = Extract<AssistantUIMessage["parts"][number], { type: "tool-createOrder" }>;
type CreatePaymentUrlPart = Extract<AssistantUIMessage["parts"][number], { type: "tool-createPaymentUrl" }>;

type ApiKeyOutput =
  | { state: "loading" }
  | { state: "confirmation-required"; confirmationKey?: string }
  | { state: "ready"; ok: boolean; status?: number; error?: string; body?: unknown };

type OrderOutput =
  | { state: "loading" }
  | { state: "confirmation-required"; confirmationKey?: string }
  | { state: "ready"; ok: boolean; status?: number; error?: string; body?: unknown };

type PaymentUrlOutput =
  | { state: "loading" }
  | { state: "confirmation-required"; confirmationKey?: string }
  | { state: "ready"; ok: boolean; status?: number; error?: string; body?: { paymentUrl?: string } | unknown };

type PaymentUrlReadyOutput = Extract<PaymentUrlOutput, { state: "ready" }>;

function extractPaymentUrl(outputBody: PaymentUrlReadyOutput["body"]): string | null {
  if (!outputBody || typeof outputBody !== "object") return null;
  if (!("paymentUrl" in outputBody)) return null;
  return typeof outputBody.paymentUrl === "string" ? outputBody.paymentUrl : null;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function renderCreateOrderOutput(out: OrderOutput) {
  if (out.state === "loading") {
    return (
      <p className="text-muted-foreground text-sm">
        Đang gọi auth-worker <code className="text-xs">POST /dashboard/order/orders</code>…
      </p>
    );
  }
  if (out.state === "confirmation-required") {
    return <p className="text-muted-foreground text-sm">Đang chờ bạn xác nhận để tạo đơn hàng.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{out.ok ? "Đã tạo đơn hàng" : "Tạo đơn hàng thất bại"}</p>
      <JsonBlock value={out.body ?? out.error} />
    </div>
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
      if (out.state === "confirmation-required") {
        return <p className="text-muted-foreground text-sm">Đang chờ bạn xác nhận để tạo API key.</p>;
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
      const amt = "amount" in input && typeof input.amount === "number" ? input.amount : 0;
      const rate = FALLBACK_USD_VND;
      const usd = rate > 0 ? amt / rate : amt;
      return <p className="text-muted-foreground text-sm">Chuẩn bị nạp ví với số tiền {formatUsd(usd)}…</p>;
    }
    case "output-available":
      return renderCreateOrderOutput(part.output as OrderOutput);
    case "output-error":
      return <p className="text-destructive text-sm">Lỗi: {part.errorText}</p>;
    default:
      return null;
  }
}

export function CreatePaymentUrlToolView({ part }: { part: CreatePaymentUrlPart }) {
  const renderOutput = (out: PaymentUrlOutput) => {
    if (out.state === "loading") {
      return <p className="text-muted-foreground text-sm">Đang tạo link thanh toán…</p>;
    }
    if (out.state === "confirmation-required") {
      return <p className="text-muted-foreground text-sm">Đang chờ bạn xác nhận để tạo link thanh toán.</p>;
    }
    if (!out.ok) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">Tạo link thanh toán thất bại</p>
          <JsonBlock value={out.error} />
        </div>
      );
    }

    const paymentUrl = extractPaymentUrl(out.body);
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Đã tạo link thanh toán</p>
        {paymentUrl ? (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary block text-sm break-all underline underline-offset-2"
          >
            {paymentUrl}
          </a>
        ) : (
          <JsonBlock value={out.body} />
        )}
      </div>
    );
  };

  switch (part.state) {
    case "input-streaming":
      return <JsonBlock value={part.input} />;
    case "input-available": {
      const { input } = part;
      return (
        <p className="text-muted-foreground text-sm">
          Chuẩn bị tạo link thanh toán cho đơn hàng:{" "}
          <span className="text-foreground font-medium">#{input.orderId}</span>
        </p>
      );
    }
    case "output-available": {
      const out = part.output as PaymentUrlOutput;
      return renderOutput(out);
    }
    case "output-error":
      return <p className="text-destructive text-sm">Lỗi: {part.errorText}</p>;
    default:
      return null;
  }
}
