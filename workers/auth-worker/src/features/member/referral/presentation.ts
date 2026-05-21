import { Hono } from 'hono';
import { requireAuth } from '../../auth/authMiddleware';
import { handleError } from '../../../shared/utils';
import { getIdFromName } from '../../../shared/utils';
import { UserDO } from '../../ws/infrastructure/UserDO';
import { executeUtils } from '../../../shared/utils';
import {
  getCommissionStatsFromD1,
  listCommissionsFromD1,
} from './commission-d1';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://aiagents-hub.vn';

export function createReferralRoutes(bindingName: string) {
  const app = new Hono<{ Bindings: Env }>();

  const createRouteHandler = (handler: Function, errorMessage: string) => {
    return async (c: any) => {
      try {
        const user = requireAuth(c);
        return await handler(c, user);
      } catch (e) {
        const { errorResponse, status } = await handleError(c, e, errorMessage);
        return c.json(errorResponse, status);
      }
    };
  };

  // Get referral link and code
  app.get('/link', createRouteHandler(async (c: any, user: any) => {
    const userDO = getIdFromName(c, user.identifier, bindingName) as DurableObjectStub<UserDO>;
    const users = await executeUtils.executeDynamicAction(userDO, 'select', {
      where: { field: 'identifier', operator: '=', value: user.identifier }
    }, 'users');
    const u = Array.isArray(users) ? users[0] : users;
    let referralCode = u?.referralCode;
    if (!referralCode && u) {
      const { generateReferralCode, storeReferralCode } = await import('./utils');
      referralCode = generateReferralCode();
      await executeUtils.executeDynamicAction(userDO, 'update', { id: u.id, referralCode }, 'users');
      if (c.env.NONCE_KV) await storeReferralCode(c.env.NONCE_KV, referralCode, user.identifier);
    }
    if (!referralCode) {
      throw new Error('Failed to get or generate referral code');
    }
    const baseUrl = c.env.FRONTEND_URL || FRONTEND_URL;
    const referralLink = `${baseUrl}/auth/v3/login?ref=${encodeURIComponent(referralCode)}`;
    return c.json({ referralLink, referralCode });
  }, 'Failed to get referral link'));

  // Commission stats: D1 (synced from DO; DO rows deleted after queue cleanup).
  app.get('/commissions/stats', createRouteHandler(async (c: any, user: any) => {
    const period = c.req.query('period') || '30';
    const days = Math.min(90, Math.max(7, parseInt(period, 10) || 30));
    const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
    const db = c.env.D1DB;
    if (!db) throw new Error('D1 database binding not configured');
    const userId = (c.env[bindingName] as DurableObjectNamespace)
      .idFromName(user.identifier)
      .toString();
    const { byDay, totalAmount } = await getCommissionStatsFromD1(db, userId, fromTs);
    return c.json({ byDay, totalAmount, period: days });
  }, 'Failed to get commission stats'));

  app.get('/commissions', createRouteHandler(async (c: any, user: any) => {
    const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
    const period = c.req.query('period') || '30';
    const days = Math.min(365, Math.max(1, parseInt(period, 10) || 30));
    const fromTs = Date.now() - days * 24 * 60 * 60 * 1000;
    const db = c.env.D1DB;
    if (!db) throw new Error('D1 database binding not configured');
    const userId = (c.env[bindingName] as DurableObjectNamespace)
      .idFromName(user.identifier)
      .toString();
    const commissions = await listCommissionsFromD1(db, userId, fromTs, limit, offset);
    return c.json({ commissions, limit, offset });
  }, 'Failed to get commissions'));

  return app;
}
