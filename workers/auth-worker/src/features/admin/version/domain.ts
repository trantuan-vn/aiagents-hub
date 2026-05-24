import { z } from 'zod';

export const VersionIdSchema = z.string().regex(/^\d+$/, 'Version ID must be a number');

export const VersionSaveResponseSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  recordCounts: z
    .object({
      services: z.number(),
      vouchers: z.number(),
      commission_policies: z.number().optional(),
    })
    .optional(),
});

export const VersionInfoSchema = z.object({
  version: z.string(),
  timestamp: z.string().optional(),
  recordCounts: z
    .object({
      services: z.number(),
      vouchers: z.number(),
      commission_policies: z.number().optional(),
    })
    .optional(),
});

export const VersionDataSchema = z.object({
  version: z.string(),
  timestamp: z.string(),
  data: z.object({
    services: z.array(z.any()),
    vouchers: z.array(z.any()),
    commission_policies: z.array(z.any()),
  }),
});

export const VersionListResponseSchema = z.object({
  versions: z.array(VersionInfoSchema),
  total: z.number(),
});

export type VersionSaveResponse = z.infer<typeof VersionSaveResponseSchema>;
export type VersionInfo = z.infer<typeof VersionInfoSchema>;
export type VersionData = z.infer<typeof VersionDataSchema>;
export type VersionListResponse = z.infer<typeof VersionListResponseSchema>;

export interface IVersionInfrastructureService {
  saveNewVersion(): Promise<VersionSaveResponse>;
  upgradeVersion(): Promise<VersionInfo>;
  getVersionData(versionId: number): Promise<VersionData>;
  getVersionList(): Promise<VersionListResponse>;
}
