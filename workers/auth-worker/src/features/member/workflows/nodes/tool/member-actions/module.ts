import { cancelOrderTool } from '../../../../../assistant/tools/cancel-order-tool';
import { createApiKeyTool } from '../../../../../assistant/tools/create-api-key-tool';
import { createOrderTool } from '../../../../../assistant/tools/create-order-tool';
import { createPaymentUrlTool } from '../../../../../assistant/tools/create-payment-url-tool';
import { getAvailableVouchersTool } from '../../../../../assistant/tools/get-available-vouchers-tool';
import { getMonitorAnalyticsTool } from '../../../../../assistant/tools/get-monitor-analytics-tool';
import { getMonitorLogsTool } from '../../../../../assistant/tools/get-monitor-logs-tool';
import { getOrderDetailTool } from '../../../../../assistant/tools/get-order-detail-tool';
import { getOrdersTool } from '../../../../../assistant/tools/get-orders-tool';
import { getOverviewTool } from '../../../../../assistant/tools/get-overview-tool';
import { getPaymentMethodsTool } from '../../../../../assistant/tools/get-payment-methods-tool';
import { getReferralCommissionStatsTool } from '../../../../../assistant/tools/get-referral-commission-stats-tool';
import { getReferralCommissionsTool } from '../../../../../assistant/tools/get-referral-commissions-tool';
import { getReferralLinkTool } from '../../../../../assistant/tools/get-referral-link-tool';
import { getServicesTool } from '../../../../../assistant/tools/get-services-tool';
import { listApiKeysTool } from '../../../../../assistant/tools/list-api-keys-tool';
import { queryPaymentTransactionTool } from '../../../../../assistant/tools/query-payment-transaction-tool';
import { refundPaymentTool } from '../../../../../assistant/tools/refund-payment-tool';
import { revokeAllApiKeysTool } from '../../../../../assistant/tools/revoke-all-api-keys-tool';
import { revokeApiKeyTool } from '../../../../../assistant/tools/revoke-api-key-tool';
import { withUserConfirmation } from '../../../../../assistant/confirmation';
import type { AgentToolBindContext, ToolModule } from '../shared/tool-module';

type MemberToolFactory = (c: any, bindingName: string, user: { identifier: string }) => any;

const READ_TOOLS: Array<[string, MemberToolFactory]> = [
  ['listApiKeys', listApiKeysTool],
  ['getOrders', getOrdersTool],
  ['getOrderDetail', getOrderDetailTool],
  ['getServices', getServicesTool],
  ['getAvailableVouchers', getAvailableVouchersTool],
  ['getPaymentMethods', () => getPaymentMethodsTool()],
  ['queryPaymentTransaction', queryPaymentTransactionTool],
  ['getOverview', getOverviewTool],
  ['getMonitorLogs', getMonitorLogsTool],
  ['getMonitorAnalytics', getMonitorAnalyticsTool],
  ['getReferralLink', getReferralLinkTool],
  ['getReferralCommissionStats', getReferralCommissionStatsTool],
  ['getReferralCommissions', getReferralCommissionsTool],
];

const WRITE_TOOLS: Array<[string, MemberToolFactory]> = [
  ['createApiKey', createApiKeyTool],
  ['revokeApiKey', revokeApiKeyTool],
  ['revokeAllApiKeys', revokeAllApiKeysTool],
  ['createOrder', createOrderTool],
  ['cancelOrder', cancelOrderTool],
  ['createPaymentUrl', createPaymentUrlTool],
  ['refundPayment', refundPaymentTool],
];

function latestUserText(bind: AgentToolBindContext): string {
  const raw = bind.triggerContext.chatInput ?? bind.triggerContext.query ?? bind.triggerContext.input;
  return String(raw ?? '').trim();
}

export const memberActionsToolModule: ToolModule = {
  kind: 'member_actions',
  toolClass: 'other',
  createAgentTools: (bind) => {
    if (!bind.c || !bind.bindingName || !bind.user?.identifier) {
      console.warn('[member-actions] missing workflow user context; dashboard tools were not registered');
      return [];
    }
    const latest = latestUserText(bind);
    const user = { identifier: bind.user.identifier };
    const reads = READ_TOOLS.map(([name, factory]) => ({
      name,
      tool: factory(bind.c, bind.bindingName as string, user),
    }));
    const writes = WRITE_TOOLS.map(([name, factory]) => ({
      name,
      tool: withUserConfirmation(factory(bind.c, bind.bindingName as string, user), latest, name),
    }));
    return [...reads, ...writes];
  },
};
