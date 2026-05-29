import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import { createLogger } from '../../../shared/logger';
import { getUsdVndRateFromEnv } from '../../admin/system-config/get-usd-vnd-rate';
import { recordTopUpAndUpgradeTier } from '../../admin/membership-tier/infrastructure';
import { getOrderWalletCreditUsd, getOrderWalletCreditVnd } from '../order/domain';
import { PaymentSchema } from '../vnpay/domain';
import { PAYMENT_STATUS, ORDER_STATUS } from '../vnpay/constant';
import {
  CapturePaypalOrder,
  CapturePaypalOrderResult,
  CreatePaypalOrder,
  CreatePaypalOrderResult,
  IPaypalService,
} from './domain';
import { getPaypalApiBase, getPaypalCredentials, PAYPAL_ERROR_MESSAGES } from './config';

const payLog = createLogger('auth-worker', 'paypal');

type OrderRow = {
  id: number;
  orderCode?: string;
  subtotalAmount?: number;
  subtotal_amount?: number;
  finalAmount?: number;
  final_amount?: number;
  currency?: string | null;
  status?: string;
  notes?: string | null;
};

export type PaypalServiceOptions = { env: Env; bindingName: string };

/** USD value charged on PayPal (after voucher) — must equal what we capture. */
function getOrderChargeUsd(order: OrderRow): number {
  const final = order.finalAmount ?? order.final_amount;
  const value = typeof final === 'number' ? final : 0;
  return Math.round(value * 100) / 100;
}

export function createPaypalService(
  userDO: DurableObjectStub<UserDO>,
  options: PaypalServiceOptions,
): IPaypalService {
  const getRate = (): Promise<number> => getUsdVndRateFromEnv(options.env, options.bindingName);

  const getAccessToken = async (): Promise<string> => {
    const { clientId, clientSecret } = await getPaypalCredentials(options.env);
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
      payLog.error('paypal.auth_failed', { status: res.status, body: await res.text() });
      throw new Error(PAYPAL_ERROR_MESSAGES.AUTH_FAILED);
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
      throw new Error(PAYPAL_ERROR_MESSAGES.AUTH_FAILED);
    }
    return json.access_token;
  };

  const loadOrder = async (orderId: number): Promise<OrderRow> => {
    const orders = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'id', operator: '=', value: orderId } },
      'orders',
    );
    if (orders.length === 0) {
      throw new Error(PAYPAL_ERROR_MESSAGES.ORDER_NOT_FOUND);
    }
    return orders[0] as OrderRow;
  };

  const assertPayableUsdOrder = (order: OrderRow): void => {
    const status = order.status ?? '';
    if (status === ORDER_STATUS.COMPLETED) {
      throw new Error(PAYPAL_ERROR_MESSAGES.ORDER_ALREADY_COMPLETED);
    }
    if (status !== ORDER_STATUS.PENDING && status !== ORDER_STATUS.CONFIRMED) {
      throw new Error(PAYPAL_ERROR_MESSAGES.ORDER_NOT_PAYABLE);
    }
    if ((order.currency ?? 'USD').toUpperCase() !== 'USD') {
      throw new Error(PAYPAL_ERROR_MESSAGES.NOT_USD_ORDER);
    }
    if (getOrderChargeUsd(order) <= 0) {
      throw new Error(PAYPAL_ERROR_MESSAGES.ORDER_NOT_PAYABLE);
    }
  };

  /** Credit the USD wallet exactly like the VNPay/Casso completion path (single multi-table tx). */
  const creditWalletForOrder = async (order: OrderRow, captureId: string): Promise<number> => {
    const userRows = await executeUtils.executeDynamicAction(userDO, 'select', {}, 'users');
    const dbUser = userRows[0];
    if (!dbUser?.id) {
      throw new Error(PAYPAL_ERROR_MESSAGES.ORDER_NOT_FOUND);
    }

    const credit = getOrderWalletCreditUsd(order);
    const prevBal = Number(dbUser.walletBalance ?? dbUser.wallet_balance ?? 0) || 0;
    const rate = await getRate();
    const topUpVnd = getOrderWalletCreditVnd({ ...order, currency: order.currency ?? 'USD' }, rate);

    await executeUtils.executeDynamicAction(userDO, 'multi-table', {
      operations: [
        {
          table: 'orders',
          operation: 'update',
          id: order.id,
          data: { status: ORDER_STATUS.COMPLETED, queueStatus: 'pending' },
        },
        {
          table: 'users',
          operation: 'update',
          id: dbUser.id,
          data: { walletBalance: prevBal + credit, queueStatus: 'pending' },
        },
      ],
    });

    try {
      await recordTopUpAndUpgradeTier(userDO, topUpVnd, options.env);
    } catch (tierErr) {
      payLog.error('paypal.tier_upgrade_failed', { orderId: order.id, captureId, tierErr });
    }

    return credit;
  };

  const createOrder = async (
    identifier: string,
    request: CreatePaypalOrder,
  ): Promise<CreatePaypalOrderResult> => {
    const order = await loadOrder(request.orderId);
    assertPayableUsdOrder(order);

    const chargeUsd = getOrderChargeUsd(order);
    const accessToken = await getAccessToken();

    const res = await fetch(`${getPaypalApiBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: String(order.id),
            description: (order.notes ?? `Wallet top-up ${order.orderCode ?? order.id}`).slice(0, 127),
            amount: {
              currency_code: 'USD',
              value: chargeUsd.toFixed(2),
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      payLog.error('paypal.create_failed', {
        orderId: order.id,
        status: res.status,
        body: await res.text(),
      });
      throw new Error(PAYPAL_ERROR_MESSAGES.CREATE_FAILED);
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw new Error(PAYPAL_ERROR_MESSAGES.CREATE_FAILED);
    }

    const paymentData = PaymentSchema.parse({
      orderId: order.id,
      paymentMethod: 'ewallet',
      gateway: 'paypal',
      status: PAYMENT_STATUS.PENDING,
      paymentDetails: { paypalOrderId: json.id, amountUsd: chargeUsd },
    });
    await executeUtils.executeDynamicAction(userDO, 'insert', paymentData, 'payments');

    payLog.info('paypal.order_created', { orderId: order.id, paypalOrderId: json.id, identifier });
    return { paypalOrderId: json.id };
  };

  const findPendingPaypalPayment = async (
    orderId: number,
    paypalOrderId: string,
  ): Promise<{ id: number } | null> => {
    const payments = await executeUtils.executeDynamicAction(
      userDO,
      'select',
      { where: { field: 'orderId', operator: '=', value: orderId } },
      'payments',
    );
    const match = (payments as Array<Record<string, any>>).find(
      (p) =>
        p.gateway === 'paypal' &&
        p.status === PAYMENT_STATUS.PENDING &&
        p.paymentDetails?.paypalOrderId === paypalOrderId,
    );
    return match ? { id: match.id as number } : null;
  };

  const captureOrder = async (
    identifier: string,
    request: CapturePaypalOrder,
  ): Promise<CapturePaypalOrderResult> => {
    const order = await loadOrder(request.orderId);
    assertPayableUsdOrder(order);

    const accessToken = await getAccessToken();
    const res = await fetch(
      `${getPaypalApiBase()}/v2/checkout/orders/${encodeURIComponent(request.paypalOrderId)}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const body = (await res.json()) as {
      status?: string;
      purchase_units?: Array<{
        custom_id?: string;
        payments?: {
          captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }>;
        };
      }>;
    };

    if (!res.ok) {
      payLog.error('paypal.capture_failed', {
        orderId: order.id,
        paypalOrderId: request.paypalOrderId,
        status: res.status,
        body,
      });
      throw new Error(PAYPAL_ERROR_MESSAGES.CAPTURE_FAILED);
    }

    const unit = body.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];

    if (body.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') {
      throw new Error(PAYPAL_ERROR_MESSAGES.CAPTURE_NOT_COMPLETED);
    }

    if (unit?.custom_id && unit.custom_id !== String(order.id)) {
      throw new Error(PAYPAL_ERROR_MESSAGES.ORDER_MISMATCH);
    }

    const expected = getOrderChargeUsd(order).toFixed(2);
    const paidValue = capture?.amount?.value;
    const paidCurrency = capture?.amount?.currency_code;
    if (paidCurrency !== 'USD' || paidValue !== expected) {
      payLog.error('paypal.amount_mismatch', {
        orderId: order.id,
        expected,
        paidValue,
        paidCurrency,
      });
      throw new Error(PAYPAL_ERROR_MESSAGES.AMOUNT_MISMATCH);
    }

    const captureId = capture?.id ?? request.paypalOrderId;

    const pendingPayment = await findPendingPaypalPayment(order.id, request.paypalOrderId);
    if (pendingPayment) {
      await executeUtils.executeDynamicAction(
        userDO,
        'update',
        {
          id: pendingPayment.id,
          status: PAYMENT_STATUS.COMPLETED,
          queueStatus: 'pending',
          paymentDetails: {
            paypalOrderId: request.paypalOrderId,
            captureId,
            amountUsd: Number(paidValue),
          },
        },
        'payments',
      );
    }

    const creditedUsd = await creditWalletForOrder(order, captureId);

    payLog.info('paypal.capture_ok', {
      orderId: order.id,
      paypalOrderId: request.paypalOrderId,
      captureId,
      creditedUsd,
      identifier,
    });

    return { success: true, orderId: order.id, creditedUsd };
  };

  return { createOrder, captureOrder };
}
