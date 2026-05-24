import { z } from "zod";

const recordCountsSchema = z.object({
  price_policies: z.number().optional(),
  services: z.number(),
  vouchers: z.number(),
  commission_policies: z.number().optional(),
});

export const versionInfoSchema = z.object({
  version: z.string(),
  timestamp: z.string().optional(),
  recordCounts: recordCountsSchema.optional(),
});

export const versionSaveResponseSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  recordCounts: recordCountsSchema.optional(),
});

export const versionDataSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  data: z.object({
    price_policies: z.array(z.any()).optional(),
    services: z.array(z.any()),
    vouchers: z.array(z.any()),
    commission_policies: z.array(z.any()).optional(),
  }),
});

export const versionListResponseSchema = z.object({
  versions: z.array(versionInfoSchema),
  total: z.number(),
});

export type VersionInfo = z.infer<typeof versionInfoSchema>;
export type VersionSaveResponse = z.infer<typeof versionSaveResponseSchema>;
export type VersionData = z.infer<typeof versionDataSchema>;
export type VersionListResponse = z.infer<typeof versionListResponseSchema>;
