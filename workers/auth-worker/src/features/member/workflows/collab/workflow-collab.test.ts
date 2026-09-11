import { describe, expect, it, vi } from 'vitest';

import { getCollabState, publishCollabState } from './workflow-collab.js';

describe('getCollabState', () => {
  it('calls the path-based collab get endpoint without a JSON body', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : new Request(input);
      expect(new URL(req.url).hostname).toBe('do');
      expect(new URL(req.url).pathname).toBe('/workflow/collab/get');
      expect(new URL(req.url).searchParams.get('workflowId')).toBe('19');
      expect(req.method).toBe('GET');
      return Response.json({ state: null });
    });
    const userDO = { fetch } as unknown as DurableObjectStub<any>;
    await expect(getCollabState(userDO, 19)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns null when the response body is empty', async () => {
    const userDO = {
      fetch: async () => new Response('', { status: 200 }),
    } as unknown as DurableObjectStub<any>;
    await expect(getCollabState(userDO, 19)).resolves.toBeNull();
  });
});

describe('publishCollabState', () => {
  it('posts to the path-based collab publish endpoint', async () => {
    const state = {
      workflowId: 19,
      definition: '{"nodes":[],"edges":[]}',
      editorId: 'ed_1',
    };
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : new Request(input);
      expect(new URL(req.url).hostname).toBe('do');
      expect(new URL(req.url).pathname).toBe('/workflow/collab/publish');
      expect(req.method).toBe('POST');
      return Response.json({
        state: { ...state, updatedAt: 1 },
      });
    });
    const userDO = { fetch } as unknown as DurableObjectStub<any>;
    await expect(publishCollabState(userDO, state)).resolves.toMatchObject(state);
  });
});
