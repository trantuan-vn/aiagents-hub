import type { UIDataTypes, UIMessage } from "ai";
import { z } from "zod";

import { CreateOrderSchema } from "../../../../../../../../auth-worker/src/features/member/order/domain";
import { CreateApiTokenSchema } from "../../../../../../../../auth-worker/src/features/member/token/domain";

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

/**
 * Narrows assistant tool names so `tool-createApiKey` / `tool-createOrder` are distinct
 * message parts (default `Record<string, UITool>` collapses to `tool-${string}` and breaks Extract / props).
 */
export type AssistantUITools = {
  createApiKey: CreateApiKeyToolUI;
  createOrder: CreateOrderToolUI;
};

export type AssistantUIMessage = UIMessage<unknown, UIDataTypes, AssistantUITools>;
