import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { getContributionReport, confirmCoeffProposal, dismissCoeffProposal } from '../../admin/billing/scan';
import { getExecutionUsagesReport } from '../../admin/billing/execution-usages';
import { getUserEconomicsReport } from '../../admin/billing/user-economics';
import { getOverview as getCloudflareUsageOverview, refreshOverview as refreshCloudflareUsage } from '../../admin/cloudflare-usage/infrastructure';
import {
  getOverview as getWorkerErrorOverview,
  listInbox as listWorkerErrors,
  refreshOverview as refreshWorkerErrors,
  updateGroup as updateWorkerErrorGroup,
} from '../../admin/cloudflare-logs/infrastructure';
import { getAdminCrmStats } from '../../admin/crm/infrastructure';
import { getAdminDefaultStats } from '../../admin/default/infrastructure';
import {
  attachBeneficiaries,
  attachWorkflowRoyaltyCredits,
  buildAccruingPayoutList,
  buildAggregatedPayoutList,
  getUnpaidPayoutKeysForUser,
  syncAllPeriodPayoutRecords,
} from '../../admin/earnings-payout/service';
import { createEarningsPayoutInfrastructure } from '../../admin/earnings-payout/infrastructure';
import { currentPeriod } from '../../admin/earnings-payout/d1';
import { getAdminFinanceStats } from '../../admin/finance/infrastructure';
import { getTierConfigsFromEnv, saveTierConfigsToKv } from '../../admin/membership-tier/get-tier-configs';
import { MembershipTierSchema, TierThresholdsSchema, thresholdsFromConfigs } from '../../admin/membership-tier/domain';
import { getExplorerGatewayReport } from '../../admin/ai-gateway-logs/report';
import { createPriceApplicationService } from '../../admin/policy/application';
import { PricePolicySchema } from '../../admin/policy/domain';
import {
  getOverview as getPipelineOverview,
  listInbox as listPipelineIncidents,
  refreshOverview as refreshPipelineHealth,
  updateIncident,
} from '../../admin/pipeline-health/infrastructure';
import { clearSyncPauseUser, setSyncPauseTables, setSyncPauseUser } from '../../admin/pipeline-health/actions';
import { createServiceApplicationService } from '../../admin/service/application';
import { ServiceSchema } from '../../admin/service/domain';
import { getBillingEconomicsFromEnv } from '../../admin/service/get-billing-economics';
import {
  DEFAULT_AUTH_CONFIG,
  DEFAULT_BILLING_CONFIG,
  DEFAULT_D1TOR2_CONFIG,
  DEFAULT_MARKETING_CONFIG,
  DEFAULT_QUEUE_CONFIG,
  KV_KEY,
  SystemConfigSchema,
  type SystemConfig,
} from '../../admin/system-config/domain';
import { readSystemConfigText, rememberSystemConfigText } from '../../admin/system-config/read-cached';
import { getPrimaryAdminIdentifier } from '../../admin/admin-identifier';
import { createVersionApplicationService } from '../../admin/version/application';
import { createVoucherApplicationService } from '../../admin/voucher/application';
import { VoucherSchema, VoucherStatusSchema } from '../../admin/voucher/domain';
import {
  listWorkflowNodeCatalog,
  syncWorkflowNodeCatalogFromSeeds,
  updateWorkflowNodeCatalogActive,
} from '../../admin/workflow-node-catalog/store';
import {
  AddMemberSchema,
  CreateEnterpriseSchema,
  PatchEnterpriseSchema,
} from '../../enterprise/domain';
import {
  adminAddMember,
  adminCreateEnterprise,
  adminDeleteEnterprise,
  adminGetEnterprise,
  adminListEnterprises,
  adminPatchEnterprise,
  adminRemoveMember,
} from '../../enterprise/admin';
import {
  adminApproveFlagRequest,
  adminListEnterpriseWorkflows,
  adminListFlagRequests,
  adminRejectFlagRequest,
} from '../../enterprise/workflow-flag';
import { grantAdminPlan } from '../../member/paypal/subscriptions';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { assertAssistantAdmin } from '../admin-access';

const RangeSchema = z.enum(['1h', '6h', '24h', '7d']).default('24h');
const DoIdSchema = z.string().trim().regex(/^[0-9a-f]{64}$/i, 'Expected a 64-character id');
const RecordIdSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
const FingerprintSchema = z.string().trim().min(6).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const CatalogIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_.:|-]+$/);
const EmailSchema = z.string().trim().email().max(320);
const AdminServicePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    endpoint: z.string().trim().min(1).max(300).optional(),
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
    model: z.string().trim().max(256).optional(),
    priceInput: z.number().min(0).optional(),
    priceOutput: z.number().min(0).optional(),
    priceInputCache: z.number().min(0).optional(),
    feePercent: z.number().min(0.01).max(1_000_000).optional(),
    modelClass: z.enum(['tiny', 'mid', 'frontier']).optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one service field is required',
  });
const IncidentStatusSchema = z.enum(['new', 'ack', 'investigating', 'resolved', 'ignored']);

export type AdminToolContext = {
  env: Env;
  c: any;
  bindingName: string;
  adminIdentifier: string;
};

export type NamedAssistantTool = { name: string; tool: Tool };

function safeError(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return 'Request failed';
  if (error.message === 'Not authorized') return error.message;
  return error.message.slice(0, 300);
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/password|secret|api[_-]?key|credential|private[_-]?key|access[_-]?token|refresh[_-]?token/i.test(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = redactSecrets(item);
    }
  }
  return out;
}

function clipValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 40).map((item) => clipValue(item, depth + 1));
    return value.length > 40 ? { total: value.length, items } : items;
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    out[key] = clipValue(item, depth + 1);
  }
  return out;
}

function present(value: unknown): unknown {
  return clipValue(redactSecrets(value), 0);
}

function requireDb(env: Env): D1Database {
  if (!env.D1DB) throw new Error('D1 database binding not configured');
  return env.D1DB;
}

function defineTool(
  ctx: AdminToolContext,
  name: string,
  description: string,
  schema: z.ZodTypeAny,
  run: (input: any) => Promise<unknown>,
): NamedAssistantTool {
  return {
    name,
    tool: tool({
      description,
      inputSchema: schema,
      async *execute(input: unknown) {
        yield { state: 'loading' as const };
        try {
          assertAssistantAdmin(ctx.env, ctx.adminIdentifier);
          const parsed = schema.parse(input ?? {});
          yield { state: 'ready' as const, ok: true, body: present(await run(parsed)) };
        } catch (error) {
          yield { state: 'ready' as const, ok: false, error: safeError(error) };
        }
      },
    }),
  };
}

function mergeSystemConfig(existing: Record<string, unknown>, patch: SystemConfig): SystemConfig {
  const current = existing as Partial<SystemConfig>;
  return {
    auth_worker: { ...DEFAULT_AUTH_CONFIG, ...(current.auth_worker ?? {}), ...(patch.auth_worker ?? {}) },
    queue_worker: { ...DEFAULT_QUEUE_CONFIG, ...(current.queue_worker ?? {}), ...(patch.queue_worker ?? {}) },
    d1tor2_cron: { ...DEFAULT_D1TOR2_CONFIG, ...(current.d1tor2_cron ?? {}), ...(patch.d1tor2_cron ?? {}) },
    billing: { ...DEFAULT_BILLING_CONFIG, ...(current.billing ?? {}), ...(patch.billing ?? {}) },
    marketing: { ...DEFAULT_MARKETING_CONFIG, ...(current.marketing ?? {}), ...(patch.marketing ?? {}) },
  };
}

async function readSystemConfig(env: Env): Promise<SystemConfig> {
  const defaults = mergeSystemConfig({}, {});
  const raw = await readSystemConfigText(env.SYSTEM_CONFIG_KV);
  if (!raw) return defaults;
  try {
    return mergeSystemConfig(JSON.parse(raw) as Record<string, unknown>, {});
  } catch {
    return defaults;
  }
}

export function createAdminAssistantTools(ctx: AdminToolContext): {
  reads: NamedAssistantTool[];
  writes: NamedAssistantTool[];
} {
  const adminId = () => assertAssistantAdmin(ctx.env, ctx.adminIdentifier);
  const priceApp = () => createPriceApplicationService(ctx.c, ctx.bindingName);
  const voucherApp = () => createVoucherApplicationService(ctx.c, ctx.bindingName);
  const serviceApp = () => createServiceApplicationService(ctx.c, ctx.bindingName);
  const versionApp = () => createVersionApplicationService(ctx.c, ctx.bindingName);

  const reads: NamedAssistantTool[] = [
    defineTool(ctx, 'adminGetDashboardStats', 'Quản trị: xem báo cáo tổng quan nền tảng (Default).', z.object({}), async () =>
      getAdminDefaultStats(requireDb(ctx.env)),
    ),
    defineTool(ctx, 'adminGetCrmStats', 'Quản trị: xem báo cáo CRM.', z.object({}), async () => getAdminCrmStats(requireDb(ctx.env))),
    defineTool(ctx, 'adminGetFinanceStats', 'Quản trị: xem báo cáo tài chính.', z.object({}), async () =>
      getAdminFinanceStats(requireDb(ctx.env)),
    ),
    defineTool(
      ctx,
      'adminGetContribution',
      'Quản trị: xem báo cáo contribution và đề xuất hệ số Credit.',
      z.object({ hours: z.number().int().min(1).max(720).default(24) }),
      async (input) => getContributionReport(ctx.env, input.hours),
    ),
    defineTool(
      ctx,
      'adminGetUserEconomics',
      'Quản trị: xem kinh tế một user hoặc toàn nền tảng.',
      z.object({ email: EmailSchema.optional(), hours: z.number().int().min(1).max(720).optional() }),
      async (input) => getUserEconomicsReport(ctx.env, { email: input.email, hours: input.hours }),
    ),
    defineTool(
      ctx,
      'adminGetExecutionUsages',
      'Quản trị: xem lịch sử Credit theo lần chạy workflow.',
      z.object({
        executionKey: z.string().trim().max(80).optional(),
        userId: DoIdSchema.optional(),
        workflowId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).max(5000).default(0),
      }),
      async (input) => getExecutionUsagesReport(requireDb(ctx.env), input),
    ),
    defineTool(
      ctx,
      'adminListMembers',
      'Quản trị: xem thành viên theo hạng membership.',
      z.object({
        tier: MembershipTierSchema.optional(),
        page: z.number().int().min(1).max(100).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      async (input) => {
        const db = requireDb(ctx.env);
        const binds: unknown[] = [];
        let sql = `SELECT identifier, role, membership_tier, monthly_top_up_vnd, tier_period_ym, wallet_balance
          FROM users WHERE role = 'member'`;
        if (input.tier) {
          sql += ` AND membership_tier = ?`;
          binds.push(input.tier);
        }
        sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
        binds.push(input.limit, (input.page - 1) * input.limit);
        const result = await db.prepare(sql).bind(...binds).all();
        return { members: result.results ?? [], page: input.page, limit: input.limit };
      },
    ),
    defineTool(ctx, 'adminGetTierConfigs', 'Quản trị: xem ngưỡng hạng thành viên.', z.object({}), async () => {
      const tiers = await getTierConfigsFromEnv(ctx.env);
      return { tiers, thresholds: thresholdsFromConfigs(tiers) };
    }),
    defineTool(
      ctx,
      'adminListVouchers',
      'Quản trị: xem voucher giảm giá.',
      z.object({ status: VoucherStatusSchema.optional() }),
      async (input) => voucherApp().getVouchers(adminId(), input.status),
    ),
    defineTool(
      ctx,
      'adminListPricePolicies',
      'Quản trị: xem chính sách hoa hồng.',
      z.object({
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).max(5000).default(0),
      }),
      async (input) => priceApp().getPricePolicies(adminId(), input.limit, input.offset, input.status),
    ),
    defineTool(ctx, 'adminListServices', 'Quản trị: xem danh mục dịch vụ, gồm dịch vụ chờ duyệt.', z.object({}), async () =>
      serviceApp().getAdminServices(adminId()),
    ),
    defineTool(
      ctx,
      'adminSearchModels',
      'Quản trị: tìm model để gắn vào dịch vụ.',
      z.object({ query: z.string().trim().min(1).max(120) }),
      async (input) => serviceApp().searchModels(input.query),
    ),
    defineTool(ctx, 'adminListEnterprises', 'Quản trị: xem danh sách doanh nghiệp.', z.object({}), async () =>
      adminListEnterprises(ctx.env),
    ),
    defineTool(
      ctx,
      'adminGetEnterprise',
      'Quản trị: xem chi tiết một doanh nghiệp.',
      z.object({ enterpriseId: z.string().uuid() }),
      async (input) => adminGetEnterprise(ctx.env, input.enterpriseId),
    ),
    defineTool(ctx, 'adminListEnterpriseFlagRequests', 'Quản trị: xem yêu cầu gắn cờ workflow doanh nghiệp đang chờ.', z.object({}), async () =>
      adminListFlagRequests(ctx.env),
    ),
    defineTool(ctx, 'adminListEnterpriseWorkflows', 'Quản trị: xem workflow đã gắn cờ doanh nghiệp.', z.object({}), async () =>
      adminListEnterpriseWorkflows(ctx.env),
    ),
    defineTool(ctx, 'adminListEarningsPayouts', 'Quản trị: xem khoản chi hoa hồng và royalty chưa trả.', z.object({}), async () => {
      const db = requireDb(ctx.env);
      const payoutInfra = createEarningsPayoutInfrastructure(
        getIdFromName(ctx.c, getPrimaryAdminIdentifier(ctx.env), ctx.bindingName) as DurableObjectStub<UserDO>,
      );
      const allRecords = await syncAllPeriodPayoutRecords(db, payoutInfra);
      const eco = await getBillingEconomicsFromEnv(ctx.env);
      const aggregated = attachWorkflowRoyaltyCredits(buildAggregatedPayoutList(allRecords), eco.creditPriceUsd);
      const accruing = attachWorkflowRoyaltyCredits(buildAccruingPayoutList(allRecords), eco.creditPriceUsd);
      const [items, accruingItems] = await Promise.all([
        attachBeneficiaries(ctx.c, ctx.bindingName, aggregated),
        attachBeneficiaries(ctx.c, ctx.bindingName, accruing),
      ]);
      return { items, accruingItems, accruingPeriod: currentPeriod() };
    }),
    defineTool(ctx, 'adminListWorkflowNodes', 'Quản trị: xem catalog node workflow.', z.object({}), async () => ({
      entries: await listWorkflowNodeCatalog(requireDb(ctx.env)),
    })),
    defineTool(ctx, 'adminGetSystemConfig', 'Quản trị: xem cấu hình hệ thống đang áp dụng.', z.object({}), async () =>
      readSystemConfig(ctx.env),
    ),
    defineTool(ctx, 'adminListVersions', 'Quản trị: xem các bản snapshot phiên bản.', z.object({}), async () =>
      versionApp().getVersionList(adminId()),
    ),
    defineTool(ctx, 'adminGetCloudflareUsage', 'Quản trị: xem mức dùng Cloudflare.', z.object({}), async () =>
      getCloudflareUsageOverview(ctx.env),
    ),
    defineTool(
      ctx,
      'adminGetWorkerErrors',
      'Quản trị: xem lỗi Worker và các nhóm lỗi.',
      z.object({ range: RangeSchema }),
      async (input) => ({
        overview: await getWorkerErrorOverview(ctx.env, input.range),
        inbox: await listWorkerErrors(ctx.env, { range: input.range }),
      }),
    ),
    defineTool(
      ctx,
      'adminGetPipelineHealth',
      'Quản trị: xem sức khỏe pipeline dữ liệu và sự cố.',
      z.object({ range: RangeSchema }),
      async (input) => ({
        overview: await getPipelineOverview(ctx.env, input.range),
        inbox: await listPipelineIncidents(ctx.env, { range: input.range }),
      }),
    ),
    defineTool(
      ctx,
      'adminGetAiGatewayLogs',
      'Quản trị: xem log AI Gateway.',
      z.object({
        range: z.enum(['1h', '24h', '7d']).default('24h'),
        page: z.number().int().min(1).max(20).default(1),
        model: z.string().trim().max(120).optional(),
        search: z.string().trim().max(120).optional(),
      }),
      async (input) => getExplorerGatewayReport(ctx.env, adminId(), input),
    ),
  ];

  const writes: NamedAssistantTool[] = [
    defineTool(
      ctx,
      'adminUpdateTierConfigs',
      'Quản trị: cập nhật ngưỡng hạng thành viên. Cần xác nhận.',
      z.object({ thresholds: TierThresholdsSchema }),
      async (input) => {
        if (!ctx.env.SYSTEM_CONFIG_KV) throw new Error('SYSTEM_CONFIG_KV not configured');
        const tiers = await saveTierConfigsToKv(ctx.env.SYSTEM_CONFIG_KV, input.thresholds);
        return { tiers, thresholds: input.thresholds };
      },
    ),
    defineTool(ctx, 'adminCreateVoucher', 'Quản trị: tạo voucher giảm giá. Cần xác nhận.', VoucherSchema, async (input) =>
      voucherApp().createVoucher(adminId(), input),
    ),
    defineTool(
      ctx,
      'adminUpdateVoucherStatus',
      'Quản trị: đổi trạng thái voucher. Cần xác nhận.',
      z.object({ voucherId: z.number().int().positive(), status: VoucherStatusSchema }),
      async (input) => voucherApp().updateVoucherStatus(adminId(), input.voucherId, input.status),
    ),
    defineTool(
      ctx,
      'adminCreatePricePolicy',
      'Quản trị: tạo chính sách hoa hồng. Cần xác nhận.',
      PricePolicySchema,
      async (input) => priceApp().createPricePolicy(adminId(), input),
    ),
    defineTool(
      ctx,
      'adminUpdatePricePolicyStatus',
      'Quản trị: bật hoặc tắt chính sách hoa hồng. Cần xác nhận.',
      z.object({ policyId: z.number().int().positive(), status: z.enum(['ACTIVE', 'INACTIVE']) }),
      async (input) => priceApp().updatePolicyStatus(adminId(), input.policyId, input.status),
    ),
    defineTool(
      ctx,
      'adminDeletePricePolicy',
      'Quản trị: xóa chính sách hoa hồng. Cần xác nhận.',
      z.object({ policyId: z.number().int().positive() }),
      async (input) => {
        await priceApp().deletePricePolicy(adminId(), input.policyId);
        return { success: true, policyId: input.policyId };
      },
    ),
    defineTool(ctx, 'adminRegisterService', 'Quản trị: đăng ký dịch vụ mới. Cần xác nhận.', ServiceSchema, async (input) =>
      serviceApp().registerService(adminId(), input),
    ),
    defineTool(
      ctx,
      'adminUpdateService',
      'Quản trị: sửa dịch vụ. Không tự duyệt dịch vụ. Cần xác nhận.',
      z.object({ serviceId: z.number().int().positive(), patch: AdminServicePatchSchema }),
      async (input) => serviceApp().updateService(adminId(), input.serviceId, input.patch),
    ),
    defineTool(
      ctx,
      'adminApproveService',
      'Quản trị: duyệt dịch vụ đang chờ. Cần xác nhận.',
      z.object({ serviceId: z.number().int().positive() }),
      async (input) => serviceApp().approveService(adminId(), input.serviceId),
    ),
    defineTool(
      ctx,
      'adminCancelService',
      'Quản trị: hủy dịch vụ. Cần xác nhận.',
      z.object({ serviceId: z.number().int().positive() }),
      async (input) => {
        await serviceApp().cancelService(adminId(), input.serviceId);
        return { success: true, serviceId: input.serviceId };
      },
    ),
    defineTool(ctx, 'adminScanCloudflareModels', 'Quản trị: quét model Cloudflare vào danh sách chờ duyệt. Cần xác nhận.', z.object({}), async () =>
      serviceApp().scanCloudflareModels(adminId()),
    ),
    defineTool(
      ctx,
      'adminCreateEnterprise',
      'Quản trị: tạo doanh nghiệp. Cần xác nhận.',
      CreateEnterpriseSchema,
      async (input) => adminCreateEnterprise(ctx.env, adminId(), input),
    ),
    defineTool(
      ctx,
      'adminUpdateEnterprise',
      'Quản trị: sửa doanh nghiệp. Cần xác nhận.',
      z.object({ enterpriseId: z.string().uuid(), patch: PatchEnterpriseSchema }),
      async (input) => adminPatchEnterprise(ctx.env, adminId(), input.enterpriseId, input.patch),
    ),
    defineTool(
      ctx,
      'adminDeleteEnterprise',
      'Quản trị: xóa doanh nghiệp. Cần xác nhận.',
      z.object({ enterpriseId: z.string().uuid() }),
      async (input) => {
        await adminDeleteEnterprise(ctx.env, adminId(), input.enterpriseId);
        return { success: true };
      },
    ),
    defineTool(
      ctx,
      'adminAddEnterpriseMember',
      'Quản trị: thêm thành viên doanh nghiệp. Cần xác nhận.',
      z.object({ enterpriseId: z.string().uuid() }).and(AddMemberSchema),
      async (input) =>
        adminAddMember(ctx.env, adminId(), input.enterpriseId, { userId: input.userId, seatRole: input.seatRole }),
    ),
    defineTool(
      ctx,
      'adminRemoveEnterpriseMember',
      'Quản trị: gỡ thành viên doanh nghiệp. Cần xác nhận.',
      z.object({ enterpriseId: z.string().uuid(), userId: z.string().trim().min(1).max(320) }),
      async (input) => {
        await adminRemoveMember(ctx.env, adminId(), input.enterpriseId, input.userId);
        return { success: true };
      },
    ),
    defineTool(
      ctx,
      'adminApproveEnterpriseFlag',
      'Quản trị: duyệt yêu cầu gắn cờ workflow doanh nghiệp. Cần xác nhận.',
      z.object({ requestId: z.string().uuid() }),
      async (input) => {
        await adminApproveFlagRequest(ctx.env, adminId(), input.requestId);
        return { success: true };
      },
    ),
    defineTool(
      ctx,
      'adminRejectEnterpriseFlag',
      'Quản trị: từ chối yêu cầu gắn cờ workflow doanh nghiệp. Cần xác nhận.',
      z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }),
      async (input) => {
        await adminRejectFlagRequest(ctx.env, adminId(), input.requestId, input.reason);
        return { success: true };
      },
    ),
    defineTool(
      ctx,
      'adminMarkPayoutPaid',
      'Quản trị: đánh dấu hoa hồng của một user là đã trả. Không gửi tiền PayPal. Cần xác nhận.',
      z.object({ recipientUserId: DoIdSchema }),
      async (input) => {
        const db = requireDb(ctx.env);
        const payoutInfra = createEarningsPayoutInfrastructure(
          getIdFromName(ctx.c, getPrimaryAdminIdentifier(ctx.env), ctx.bindingName) as DurableObjectStub<UserDO>,
        );
        const unpaid = await getUnpaidPayoutKeysForUser(db, payoutInfra, input.recipientUserId);
        if (unpaid.keys.length === 0 || unpaid.totalAmountUsd <= 0) {
          throw new Error('No unpaid earnings to mark as paid for this user');
        }
        await payoutInfra.markPaidBatch(unpaid.keys, `Assistant payout ${unpaid.identifier}`);
        return {
          success: true,
          amountUsd: unpaid.totalAmountUsd,
          recipientUserId: input.recipientUserId,
          recipientIdentifier: unpaid.identifier,
          payoutKeys: unpaid.keys,
        };
      },
    ),
    defineTool(
      ctx,
      'adminSetWorkflowNodeActive',
      'Quản trị: bật hoặc tắt một node trong catalog. Cần xác nhận.',
      z.object({ id: CatalogIdSchema, isActive: z.boolean() }),
      async (input) => {
        const entry = await updateWorkflowNodeCatalogActive(requireDb(ctx.env), input.id, input.isActive);
        if (!entry) throw new Error('Catalog entry not found');
        return { entry };
      },
    ),
    defineTool(ctx, 'adminSyncWorkflowNodes', 'Quản trị: đồng bộ catalog node từ seed. Cần xác nhận.', z.object({}), async () => {
      const db = requireDb(ctx.env);
      const synced = await syncWorkflowNodeCatalogFromSeeds(db);
      return { synced };
    }),
    defineTool(
      ctx,
      'adminUpdateSystemConfig',
      'Quản trị: cập nhật một phần cấu hình hệ thống trong giới hạn cho phép. Cần xác nhận.',
      SystemConfigSchema,
      async (input) => {
        const kv = ctx.env.SYSTEM_CONFIG_KV;
        if (!kv) throw new Error('SYSTEM_CONFIG_KV not configured');
        const raw = await readSystemConfigText(kv);
        const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const merged = mergeSystemConfig(existing, input);
        await kv.put(KV_KEY, JSON.stringify(merged));
        rememberSystemConfigText(JSON.stringify(merged));
        return merged;
      },
    ),
    defineTool(ctx, 'adminSaveVersion', 'Quản trị: lưu snapshot phiên bản mới. Cần xác nhận.', z.object({}), async () =>
      versionApp().saveNewVersion(adminId()),
    ),
    defineTool(
      ctx,
      'adminGrantPlan',
      'Quản trị: gán gói cho một user. Không đổi role. Cần xác nhận và lý do.',
      z.object({
        email: EmailSchema,
        planId: z.enum(['free', 'starter', 'pro', 'business']),
        reason: z.string().trim().min(1).max(500),
      }),
      async (input) => {
        const userDO = getIdFromName(ctx.c, input.email, ctx.bindingName) as DurableObjectStub<UserDO>;
        return grantAdminPlan({ userDO, planId: input.planId, reason: input.reason });
      },
    ),
    defineTool(
      ctx,
      'adminSendNotification',
      'Quản trị: gửi thông báo tới tối đa 20 email. Cần xác nhận.',
      z.object({
        emails: z.array(EmailSchema).min(1).max(20),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().max(500).optional(),
        dashboardPath: z
          .string()
          .trim()
          .regex(/^\/dashboard\/[A-Za-z0-9/_-]{0,120}$/)
          .optional(),
      }),
      async (input) => {
        const bindings = ctx.env as unknown as Record<string, DurableObjectNamespace | undefined>;
        const binding = bindings[ctx.bindingName];
        const broadcastBinding = ctx.env.BROADCAST_SERVICE_DO;
        if (!binding || !broadcastBinding) throw new Error('Notification binding is not configured');
        const emails = [...new Set((input.emails as string[]).map((email) => email.toLowerCase()))];
        const targetUsers = emails.map((email) => binding.idFromName(email).toString());
        const response = await broadcastBinding
          .get(broadcastBinding.idFromName('global'))
          .fetch('https://broadcast.service/dashboard/ws/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                title: input.title,
                body: input.body,
                data: input.dashboardPath ? { link: input.dashboardPath } : undefined,
              },
              targetUsers,
              priority: 'normal',
              expiresIn: 60_000,
            }),
          });
        if (!response.ok) throw new Error('Failed to send notification');
        return { success: true, targetCount: targetUsers.length };
      },
    ),
    defineTool(
      ctx,
      'adminBroadcastNotification',
      'Quản trị: gửi thông báo tới mọi phiên đăng nhập. Cần xác nhận và audience phải là all.',
      z.object({
        audience: z.literal('all'),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().max(500).optional(),
        dashboardPath: z
          .string()
          .trim()
          .regex(/^\/dashboard\/[A-Za-z0-9/_-]{0,120}$/)
          .optional(),
      }),
      async (input) => {
        const broadcastBinding = ctx.env.BROADCAST_SERVICE_DO;
        if (!broadcastBinding) throw new Error('Notification binding is not configured');
        const response = await broadcastBinding
          .get(broadcastBinding.idFromName('global'))
          .fetch('https://broadcast.service/dashboard/ws/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                title: input.title,
                body: input.body,
                data: input.dashboardPath ? { link: input.dashboardPath } : undefined,
              },
              priority: 'normal',
              expiresIn: 60_000,
            }),
          });
        if (!response.ok) throw new Error('Failed to broadcast notification');
        return { success: true, audience: input.audience };
      },
    ),
    defineTool(
      ctx,
      'adminRefreshCloudflareUsage',
      'Quản trị: làm mới số liệu Cloudflare. Cần xác nhận.',
      z.object({}),
      async () => refreshCloudflareUsage(ctx.env, adminId()),
    ),
    defineTool(
      ctx,
      'adminRefreshWorkerErrors',
      'Quản trị: làm mới nhóm lỗi Worker. Cần xác nhận.',
      z.object({ range: RangeSchema }),
      async (input) => refreshWorkerErrors(ctx.env, adminId(), input.range),
    ),
    defineTool(
      ctx,
      'adminUpdateWorkerErrorGroup',
      'Quản trị: cập nhật trạng thái một nhóm lỗi Worker. Cần xác nhận.',
      z.object({ fingerprint: FingerprintSchema, status: IncidentStatusSchema, note: z.string().trim().max(500).optional() }),
      async (input) => updateWorkerErrorGroup(ctx.env, input.fingerprint, adminId(), { status: input.status, note: input.note }),
    ),
    defineTool(
      ctx,
      'adminRefreshPipelineHealth',
      'Quản trị: làm mới sức khỏe pipeline. Cần xác nhận.',
      z.object({ range: RangeSchema }),
      async (input) => refreshPipelineHealth(ctx.env, adminId(), input.range),
    ),
    defineTool(
      ctx,
      'adminUpdatePipelineIncident',
      'Quản trị: cập nhật trạng thái một sự cố pipeline. Cần xác nhận.',
      z.object({ fingerprint: FingerprintSchema, status: IncidentStatusSchema, note: z.string().trim().max(500).optional() }),
      async (input) => updateIncident(ctx.env, input.fingerprint, adminId(), { status: input.status, note: input.note }),
    ),
    defineTool(
      ctx,
      'adminPauseSyncTables',
      'Quản trị: tạm dừng đồng bộ các bảng pipeline. Cần xác nhận.',
      z.object({ tables: z.array(z.string().trim().min(1).max(80)).max(50) }),
      async (input) => setSyncPauseTables(ctx.env, adminId(), { tables: input.tables, confirm: true }),
    ),
    defineTool(
      ctx,
      'adminPauseSyncUser',
      'Quản trị: tạm dừng đồng bộ của một user. Cần xác nhận.',
      z.object({
        userId: DoIdSchema,
        reason: z.string().trim().max(300).optional(),
        ttlSec: z.number().int().min(60).max(86_400).optional(),
      }),
      async (input) => setSyncPauseUser(ctx.env, adminId(), { ...input, confirm: true }),
    ),
    defineTool(
      ctx,
      'adminResumeSyncUser',
      'Quản trị: tiếp tục đồng bộ của một user. Cần xác nhận.',
      z.object({ userId: DoIdSchema }),
      async (input) => clearSyncPauseUser(ctx.env, adminId(), { userId: input.userId, confirm: true }),
    ),
    defineTool(
      ctx,
      'adminConfirmContributionProposal',
      'Quản trị: áp dụng một đề xuất hệ số Credit. Cần xác nhận.',
      z.object({ proposalId: RecordIdSchema }),
      async (input) => confirmCoeffProposal(ctx.env, input.proposalId),
    ),
    defineTool(
      ctx,
      'adminDismissContributionProposal',
      'Quản trị: bỏ một đề xuất hệ số Credit. Cần xác nhận.',
      z.object({ proposalId: RecordIdSchema }),
      async (input) => dismissCoeffProposal(ctx.env, input.proposalId),
    ),
  ];

  return { reads, writes };
}
