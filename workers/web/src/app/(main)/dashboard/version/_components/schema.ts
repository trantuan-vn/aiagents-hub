import { z } from "zod";

// Version Info Schema
export const versionInfoSchema = z.object({
  version: z.string(),
  timestamp: z.string().optional(),
  recordCounts: z
    .object({
      price_policies: z.number(),
      services: z.number(),
      vouchers: z.number(),
    })
    .optional(),
});

// Version Save Response Schema
export const versionSaveResponseSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  recordCounts: z
    .object({
      price_policies: z.number(),
      services: z.number(),
      vouchers: z.number(),
    })
    .optional(),
});

// Version Data Schema
export const versionDataSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  data: z.object({
    price_policies: z.array(z.any()),
    services: z.array(z.any()),
    vouchers: z.array(z.any()),
  }),
});

// Version List Response Schema
export const versionListResponseSchema = z.object({
  versions: z.array(versionInfoSchema),
  total: z.number(),
});

// Types
export type VersionInfo = z.infer<typeof versionInfoSchema>;
export type VersionSaveResponse = z.infer<typeof versionSaveResponseSchema>;
export type VersionData = z.infer<typeof versionDataSchema>;
export type VersionListResponse = z.infer<typeof versionListResponseSchema>;
