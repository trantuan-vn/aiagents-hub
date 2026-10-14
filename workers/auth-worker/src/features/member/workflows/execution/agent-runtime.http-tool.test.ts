import { describe, expect, it } from 'vitest';

import { isHttpAgentToolNode } from './http-agent-tool.js';

describe('isHttpAgentToolNode', () => {
  it('accepts a canvas HTTP tool and a legacy asTool request', () => {
    expect(isHttpAgentToolNode({ type: 'tool_node', data: { toolKind: 'http-request', url: 'https://api.aiagents-hub.vn/public/plans' } })).toBe(true);
    expect(isHttpAgentToolNode({ type: 'http_request', data: { asTool: true, url: 'https://api.aiagents-hub.vn/public/plans' } })).toBe(true);
  });

  it('rejects an HTTP node that is not offered to the agent', () => {
    expect(isHttpAgentToolNode({ type: 'http_request', data: { url: 'https://example.com' } })).toBe(false);
    expect(isHttpAgentToolNode({ type: 'tool_node', data: { toolKind: 'get-rag' } })).toBe(false);
  });
});
