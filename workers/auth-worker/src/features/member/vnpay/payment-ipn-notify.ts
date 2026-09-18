import { UserDO } from '../../ws/infrastructure/UserDO';

export const PAYMENT_IPN_KIND = 'payment_ipn';

export type PaymentIpnBroadcastMessage = {
  title: string;
  body: string;
  data: {
    kind: typeof PAYMENT_IPN_KIND;
    status: 'success';
    orderId: number;
    paymentId: number;
  };
};

export function paymentIpnSuccessMessage(input: {
  orderId: number;
  paymentId: number;
}): PaymentIpnBroadcastMessage {
  return {
    title: 'Thanh toán thành công',
    body: 'Đơn hàng đã được ghi nhận.',
    data: {
      kind: PAYMENT_IPN_KIND,
      status: 'success',
      orderId: input.orderId,
      paymentId: input.paymentId,
    },
  };
}

/** Same `broadcast` event as in-app notifications — no extra WS channel. */
export async function notifyPaymentIpnSuccess(
  userDO: DurableObjectStub<UserDO>,
  input: { orderId: number; paymentId: number },
): Promise<void> {
  try {
    const response = await userDO.fetch('https://user.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'broadcast',
        message: paymentIpnSuccessMessage(input),
      }),
    });
    if (!response.ok) {
      console.warn('[Payment] IPN broadcast failed', response.status, await response.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[Payment] IPN broadcast error', e);
  }
}
