import { createLogger } from '../../../shared/logger';
import { getPaypalApiBase, getPaypalCredentials } from '../../member/paypal/config';

const payLog = createLogger('auth-worker', 'paypal-payout');

export const PAYPAL_PAYOUT_ERROR_MESSAGES = {
  CONFIG_MISSING: 'PayPal is not configured',
  AUTH_FAILED: 'Failed to authenticate with PayPal',
  PAYOUT_FAILED: 'Failed to send PayPal payout',
  PAYOUT_DENIED: 'PayPal rejected the payout',
  AMOUNT_TOO_LOW: 'Payout amount must be at least $0.01',
} as const;

async function getAccessToken(env: Env): Promise<string> {
  const { clientId, clientSecret } = await getPaypalCredentials(env);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${getPaypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    payLog.error('paypal_payout.auth_failed', { status: res.status, body: await res.text() });
    throw new Error(PAYPAL_PAYOUT_ERROR_MESSAGES.AUTH_FAILED);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error(PAYPAL_PAYOUT_ERROR_MESSAGES.AUTH_FAILED);
  }
  return json.access_token;
}

function roundUsd(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

export interface SendPaypalPayoutInput {
  recipientEmail: string;
  amountUsd: number;
  /** Unique id for PayPal sender_batch_id / sender_item_id (idempotency). */
  batchId: string;
  note?: string;
}

export interface SendPaypalPayoutResult {
  payoutBatchId: string;
  batchStatus: string;
  itemStatus?: string;
}

/** Send USD to a PayPal account via PayPal Payouts (business account). */
export async function sendPaypalPayout(
  env: Env,
  input: SendPaypalPayoutInput,
): Promise<SendPaypalPayoutResult> {
  if (input.amountUsd < 0.01) {
    throw new Error(PAYPAL_PAYOUT_ERROR_MESSAGES.AMOUNT_TOO_LOW);
  }

  const accessToken = await getAccessToken(env);
  const amountValue = roundUsd(input.amountUsd);
  const safeBatchId = input.batchId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 127);

  const res = await fetch(`${getPaypalApiBase()}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: safeBatchId,
        email_subject: 'You have received an earnings payout',
        email_message: 'Your commission and workflow earnings payout has been sent.',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: amountValue,
            currency: 'USD',
          },
          receiver: input.recipientEmail.trim().toLowerCase(),
          sender_item_id: `${safeBatchId}_item`,
          note: (input.note ?? 'Earnings payout').slice(0, 255),
        },
      ],
    }),
  });

  const body = (await res.json()) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
    items?: Array<{ transaction_status?: string; errors?: { name?: string; message?: string } }>;
  };

  if (!res.ok) {
    payLog.error('paypal_payout.create_failed', {
      batchId: safeBatchId,
      status: res.status,
      body,
    });
    throw new Error(PAYPAL_PAYOUT_ERROR_MESSAGES.PAYOUT_FAILED);
  }

  const batchStatus = body.batch_header?.batch_status ?? '';
  const payoutBatchId = body.batch_header?.payout_batch_id ?? safeBatchId;
  const itemStatus = body.items?.[0]?.transaction_status;
  const itemError = body.items?.[0]?.errors;

  if (batchStatus === 'DENIED' || itemStatus === 'FAILED' || itemStatus === 'RETURNED') {
    payLog.error('paypal_payout.denied', { batchId: safeBatchId, batchStatus, itemStatus, itemError });
    throw new Error(PAYPAL_PAYOUT_ERROR_MESSAGES.PAYOUT_DENIED);
  }

  payLog.info('paypal_payout.sent', {
    payoutBatchId,
    batchStatus,
    itemStatus,
    amountUsd: amountValue,
    recipientEmail: input.recipientEmail,
  });

  return { payoutBatchId, batchStatus, itemStatus };
}
