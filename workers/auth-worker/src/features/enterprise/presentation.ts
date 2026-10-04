import { Hono } from 'hono';

import { handleError } from '../../shared/utils';
import { requireAdmin, requireAuth } from '../auth/authMiddleware';
import {
  adminAddMember,
  adminCreateEnterprise,
  adminDeleteEnterprise,
  adminGetEnterprise,
  adminListEnterprises,
  adminPatchEnterprise,
  adminRemoveMember,
} from './admin';
import { billingSnapshot, cancelInvoice, checkoutPeriod, checkoutSeat } from './billing';
import {
  AddMemberSchema,
  CheckoutSchema,
  CreateEnterpriseSchema,
  EnterpriseError,
  PatchEnterpriseSchema,
  RejectFlagRequestSchema,
  SeatCheckoutSchema,
  SetWorkflowFlagSchema,
} from './domain';
import {
  adminApproveFlagRequest,
  adminGetFlagRequest,
  adminListFlagRequests,
  adminRejectFlagRequest,
  adminSetWorkflowFlag,
} from './workflow-flag';
import { businessDecideProposal, enterpriseCatalog } from './workflow-proposal';

type Guard = (c: any) => { identifier: string };

function route(guard: Guard, fn: (c: any, user: { identifier: string }) => Promise<Response>, fallback: string) {
  return async (c: any) => {
    try {
      return await fn(c, guard(c));
    } catch (e) {
      if (e instanceof EnterpriseError) return c.json({ error: e.code, code: e.code }, e.status);
      const { errorResponse, status } = await handleError(c, e, fallback);
      return c.json(errorResponse, status);
    }
  };
}

function checkoutResponse(created: { invoiceId: string; orderId: number; amountUsd: number }) {
  return {
    ...created,
    checkoutPath: `/dashboard/control/billing?payOrder=${created.orderId}`,
  };
}

/** Mounted at `/dashboard/admin/enterprises`. */
export function createAdminEnterpriseRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const admin = (fn: (c: any, user: { identifier: string }) => Promise<Response>, fallback: string) =>
    route(requireAdmin, fn, fallback);

  app.get('/', admin(async (c) => c.json({ enterprises: await adminListEnterprises(c.env) }), 'Failed to list enterprises'));

  app.post(
    '/',
    admin(async (c, user) => {
      const body = CreateEnterpriseSchema.parse(await c.req.json());
      return c.json({ enterprise: await adminCreateEnterprise(c.env, user.identifier, body) }, 201);
    }, 'Failed to create enterprise'),
  );

  app.get('/:id', admin(async (c) => c.json(await adminGetEnterprise(c.env, c.req.param('id'))), 'Failed to load enterprise'));

  app.patch(
    '/:id',
    admin(async (c, user) => {
      const body = PatchEnterpriseSchema.parse(await c.req.json());
      return c.json({ enterprise: await adminPatchEnterprise(c.env, user.identifier, c.req.param('id'), body) });
    }, 'Failed to update enterprise'),
  );

  app.delete(
    '/:id',
    admin(async (c, user) => {
      await adminDeleteEnterprise(c.env, user.identifier, c.req.param('id'));
      return c.json({ success: true });
    }, 'Failed to delete enterprise'),
  );

  app.post(
    '/:id/members',
    admin(async (c, user) => {
      const body = AddMemberSchema.parse(await c.req.json());
      return c.json({ member: await adminAddMember(c.env, user.identifier, c.req.param('id'), body) }, 201);
    }, 'Failed to add member'),
  );

  app.delete(
    '/:id/members/:userId',
    admin(async (c, user) => {
      await adminRemoveMember(c.env, user.identifier, c.req.param('id'), decodeURIComponent(c.req.param('userId')));
      return c.json({ success: true });
    }, 'Failed to remove member'),
  );

  return app;
}

/** Mounted at `/dashboard/admin/enterprise-flag-requests`. */
export function createAdminEnterpriseFlagRequestRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const admin = (fn: (c: any, user: { identifier: string }) => Promise<Response>, fallback: string) =>
    route(requireAdmin, fn, fallback);

  app.get('/', admin(async (c) => c.json({ requests: await adminListFlagRequests(c.env) }), 'Failed to list flag requests'));

  app.get('/:id', admin(async (c) => c.json(await adminGetFlagRequest(c.env, c.req.param('id'))), 'Failed to load flag request'));

  app.post(
    '/:id/approve',
    admin(async (c, user) => {
      await adminApproveFlagRequest(c.env, user.identifier, c.req.param('id'));
      return c.json({ success: true });
    }, 'Failed to approve flag request'),
  );

  app.post(
    '/:id/reject',
    admin(async (c, user) => {
      const { reason } = RejectFlagRequestSchema.parse(await c.req.json());
      await adminRejectFlagRequest(c.env, user.identifier, c.req.param('id'), reason);
      return c.json({ success: true });
    }, 'Failed to reject flag request'),
  );

  return app;
}

/** Mounted at `/dashboard/admin/workflows`. */
export function createAdminWorkflowEnterpriseRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.put(
    '/:ownerId/:workflowId/enterprise',
    route(requireAdmin, async (c, user) => {
      const workflowId = parseInt(c.req.param('workflowId'), 10);
      if (isNaN(workflowId)) throw new Error('Invalid workflow id');
      const body = SetWorkflowFlagSchema.parse(await c.req.json());
      await adminSetWorkflowFlag(c.env, user.identifier, c.req.param('ownerId'), workflowId, body);
      return c.json({ success: true });
    }, 'Failed to set enterprise flag'),
  );

  return app;
}

/** Mounted at `/dashboard/build/workflows/enterprise`, ahead of the workflow router's `/:id`. */
export function createEnterpriseWorkflowRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const member = (fn: (c: any, user: { identifier: string }) => Promise<Response>, fallback: string) =>
    route(requireAuth, fn, fallback);

  app.get('/', member(async (c, user) => c.json(await enterpriseCatalog(c.env, user.identifier)), 'Failed to load organization workflows'));

  for (const decision of ['accept', 'reject', 'release'] as const) {
    app.post(
      `/:ownerId/:workflowId/${decision}`,
      member(async (c, user) => {
        const workflowId = parseInt(c.req.param('workflowId'), 10);
        if (isNaN(workflowId)) throw new Error('Invalid workflow id');
        await businessDecideProposal(c.env, user.identifier, c.req.param('ownerId'), workflowId, decision);
        return c.json({ success: true });
      }, `Failed to ${decision} workflow`),
    );
  }

  return app;
}

/** Mounted at `/dashboard/enterprises`. Business seats pay the organization's period here. */
export function createEnterpriseMemberRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  const member = (fn: (c: any, user: { identifier: string }) => Promise<Response>, fallback: string) =>
    route(requireAuth, fn, fallback);

  app.get(
    '/mine/billing',
    member(async (c, user) => c.json(await billingSnapshot(c.env, user.identifier)), 'Failed to load enterprise billing'),
  );

  app.post(
    '/mine/billing/checkout',
    member(async (c, user) => {
      const body = CheckoutSchema.parse(await c.req.json());
      return c.json(checkoutResponse(await checkoutPeriod(c.env, user.identifier, body.interval)), 201);
    }, 'Failed to create enterprise invoice'),
  );

  app.post(
    '/mine/billing/checkout/:invoiceId/cancel',
    member(async (c, user) => {
      await cancelInvoice(c.env, user.identifier, c.req.param('invoiceId'));
      return c.json({ success: true });
    }, 'Failed to cancel enterprise invoice'),
  );

  app.post(
    '/mine/billing/seats',
    member(async (c, user) => {
      const body = SeatCheckoutSchema.parse(await c.req.json());
      return c.json(checkoutResponse(await checkoutSeat(c.env, user.identifier, body.userId)), 201);
    }, 'Failed to create seat invoice'),
  );

  return app;
}
