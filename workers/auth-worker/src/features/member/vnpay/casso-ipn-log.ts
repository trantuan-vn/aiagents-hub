import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { CASSO_IPN_LOG_MAX } from './constant';

export type CassoIpnLogEntry = {
  success: boolean;
  code: string;
  message: string;
  phase: 'webhook' | 'process';
  creditedAmount?: number;
  externalRef?: string;
  transferCode?: string;
  cassoError?: number;
};

/** Persist Casso IPN attempts on the payment row for support / dispute lookup. */
export async function appendCassoIpnLog(
  userDO: DurableObjectStub<UserDO>,
  paymentId: number,
  entry: CassoIpnLogEntry,
): Promise<void> {
  try {
    const payments = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'id', operator: '=', value: paymentId } },
      'payments',
    );
    if (payments.length === 0) return;

    const row = payments[0] as { paymentDetails?: Record<string, unknown> };
    const details = { ...(row.paymentDetails ?? {}) };
    const existing = Array.isArray(details.casso_ipn_logs) ? details.casso_ipn_logs : [];
    const logs = [
      ...existing,
      { ...entry, at: new Date().toISOString() },
    ].slice(-CASSO_IPN_LOG_MAX);

    await executeUtils.executeDynamicAction(
      userDO,
      'update',
      {
        id: paymentId,
        paymentDetails: { ...details, casso_ipn_logs: logs },
      },
      'payments',
    );
  } catch (e) {
    console.error('[CassoIPN] appendCassoIpnLog failed', { paymentId, entry, e });
  }
}
