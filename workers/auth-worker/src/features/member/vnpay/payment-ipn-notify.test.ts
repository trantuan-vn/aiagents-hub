import { describe, expect, it } from 'vitest';

import { PAYMENT_IPN_KIND, paymentIpnSuccessMessage } from './payment-ipn-notify.js';

describe('payment IPN broadcast', () => {
  it('uses the notification broadcast payload shape', () => {
    const msg = paymentIpnSuccessMessage({ orderId: 42, paymentId: 9 });
    expect(msg.title).toBeTruthy();
    expect(msg.data).toEqual({
      kind: PAYMENT_IPN_KIND,
      status: 'success',
      orderId: 42,
      paymentId: 9,
    });
  });
});
