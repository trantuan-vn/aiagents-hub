export const PAYPAL_ERROR_MESSAGES = {
  INVALID_REQUEST: 'Invalid request parameters',
  ORDER_NOT_FOUND: 'Order not found',
  ORDER_ALREADY_COMPLETED: 'Order already completed',
  ORDER_NOT_PAYABLE: 'Order is not payable',
  NOT_USD_ORDER: 'Only USD orders can be paid with PayPal',
  CONFIG_MISSING: 'PayPal is not configured',
  AUTH_FAILED: 'Failed to authenticate with PayPal',
  CREATE_FAILED: 'Failed to create PayPal order',
  CAPTURE_FAILED: 'Failed to capture PayPal payment',
  CAPTURE_NOT_COMPLETED: 'PayPal payment was not completed',
  AMOUNT_MISMATCH: 'PayPal payment amount does not match the order',
  ORDER_MISMATCH: 'PayPal order does not match the internal order',
} as const;

/** Live PayPal REST API base. Override with PAYPAL_API_BASE (e.g. sandbox) if ever needed. */
export function getPaypalApiBase(): string {
  return process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com';
}

/** Public PayPal client id (safe to expose to the browser SDK). Empty string when not configured. */
export async function getPaypalClientId(env: Env): Promise<string> {
  try {
    return (await env.PAYPAL_CLIENT_ID.get()) ?? '';
  } catch {
    return '';
  }
}

/** Reads PayPal REST credentials from the Secrets Store. */
export async function getPaypalCredentials(env: Env): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    env.PAYPAL_CLIENT_ID.get(),
    env.PAYPAL_CLIENT_SECRET.get(),
  ]);
  if (!clientId) {
    throw new Error('PAYPAL_CLIENT_ID is not defined in secrets store');
  }
  if (!clientSecret) {
    throw new Error('PAYPAL_CLIENT_SECRET is not defined in secrets store');
  }
  return { clientId, clientSecret };
}
