import type { UIDataTypes, UIMessage } from "ai";
import { z } from "zod";

import { CreateOrderSchema } from "../../../../../../../../auth-worker/src/features/member/order/domain";
import { CreateApiTokenSchema } from "../../../../../../../../auth-worker/src/features/member/token/domain";
import { CreatePaymentSchema } from "../../../../../../../../auth-worker/src/features/member/vnpay/domain";

/** Matches auth-worker member/assistant createApiKey tool inputSchema. */
export type CreateApiKeyToolUI = {
  input: z.infer<typeof CreateApiTokenSchema>;
  output: unknown;
};

/** Matches auth-worker member/assistant createOrder tool inputSchema. */
export type CreateOrderToolUI = {
  input: z.infer<typeof CreateOrderSchema>;
  output: unknown;
};

/** Matches auth-worker member/assistant createPaymentUrl tool inputSchema. */
export type CreatePaymentUrlToolUI = {
  input: z.infer<typeof CreatePaymentSchema>;
  output: unknown;
};

/**
 * Narrows assistant tool names so specific tool-* parts are strongly typed.
 * message parts (default `Record<string, UITool>` collapses to `tool-${string}` and breaks Extract / props).
 */
export type AssistantUITools = {
  createApiKey: CreateApiKeyToolUI;
  createOrder: CreateOrderToolUI;
  createPaymentUrl: CreatePaymentUrlToolUI;
};

export type AssistantUIMessage = UIMessage<unknown, UIDataTypes, AssistantUITools>;
