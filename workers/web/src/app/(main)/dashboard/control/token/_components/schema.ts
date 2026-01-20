import { z } from "zod";

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default([]),
  expiresInDays: z.number().min(1).max(365).default(30),
});

export const revokeApiTokenSchema = z.object({
  tokenId: z.number().int(),
});

export const apiTokenSchema = z.object({
  id: z.number(),
  name: z.string(),
  permissions: z.array(z.string()),
  expiresAt: z.string().optional().nullable(),
  createdAt: z.string(),
  isActive: z.boolean(),
});

// Define type explicitly to ensure required fields match react-hook-form expectations
export type CreateApiToken = {
  name: string;
  permissions: string[];
  expiresInDays: number;
};

export type RevokeApiToken = z.infer<typeof revokeApiTokenSchema>;
export type ApiToken = z.infer<typeof apiTokenSchema>;
