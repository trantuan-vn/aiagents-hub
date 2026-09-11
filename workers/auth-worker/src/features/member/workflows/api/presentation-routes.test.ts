import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createWorkflowNodeCatalogMemberRoutes } from '../../../admin/workflow-node-catalog/presentation';
import { createWorkflowRoutes } from './presentation';

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return JSON.stringify(body);
}

describe('workflow node-catalog routing', () => {
  it('does not treat node-catalog as a workflow id on the workflows router', async () => {
    const app = createWorkflowRoutes('USER_DO');
    const res = await app.request('/node-catalog');
    expect(await errorMessage(res)).not.toContain('Invalid workflow id');
  });

  it('prefers the dedicated node-catalog mount over overlapping /:id routes', async () => {
    const app = new Hono();
    app.route(
      '/dashboard/build/workflows/node-catalog',
      createWorkflowNodeCatalogMemberRoutes('USER_DO'),
    );
    app.route('/dashboard/build/workflows', createWorkflowRoutes('USER_DO'));
    const res = await app.request('/dashboard/build/workflows/node-catalog');
    expect(await errorMessage(res)).not.toContain('Invalid workflow id');
  });
});
