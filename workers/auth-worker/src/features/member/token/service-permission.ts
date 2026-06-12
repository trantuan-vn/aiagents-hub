import type { Context } from 'hono';

import { getIdFromString } from '../../../shared/utils.js';
import type { UserDO } from '../../ws/infrastructure/UserDO.js';
import { resolveServiceByEndpoint } from '../workflows/billing.js';
import { requirePermissions } from './authMiddleware.js';

/** Token must include `endpoint` permission and the endpoint must be an approved active service. */
export async function requireServiceEndpointPermission(
  c: Context,
  bindingName: string,
  endpoint: string,
) {
  const token = requirePermissions(c, [endpoint]);

  const clientId = c.req.header('X-Client-ID') || c.req.query('client_id');
  if (!clientId || typeof clientId !== 'string') {
    throw new Error('Invalid client ID');
  }

  const userDO = getIdFromString(c, clientId, bindingName) as DurableObjectStub<UserDO>;
  const service = await resolveServiceByEndpoint(userDO, endpoint);

  return { token, service };
}
