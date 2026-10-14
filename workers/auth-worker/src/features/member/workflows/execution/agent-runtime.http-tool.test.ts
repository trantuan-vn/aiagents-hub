import { describe, expect, it } from 'vitest';

import { agentHttpToolUrlIsSafe, isHttpAgentToolNode } from './http-agent-tool.js';

describe('isHttpAgentToolNode', () => {
  it('accepts a canvas HTTP tool and a legacy asTool request', () => {
    expect(isHttpAgentToolNode({ type: 'tool_node', data: { toolKind: 'http-request', url: 'https://api.aiagents-hub.vn/public/plans' } })).toBe(true);
    expect(isHttpAgentToolNode({ type: 'http_request', data: { asTool: true, url: 'https://api.aiagents-hub.vn/public/plans' } })).toBe(true);
  });

  it('allows a path template on a fixed host and rejects a model-controlled host', () => {
    expect(agentHttpToolUrlIsSafe('https://api.aiagents-hub.vn/public/plans')).toBe(true);
    expect(agentHttpToolUrlIsSafe('https://api.example.com/items/{{ args.id }}')).toBe(true);
    expect(agentHttpToolUrlIsSafe('https://{{ args.host }}/plans')).toBe(false);
    expect(agentHttpToolUrlIsSafe('{{ args.url }}')).toBe(false);
    expect(agentHttpToolUrlIsSafe('https://api.example.com/{{ $json.chatInput }}')).toBe(false);
  });

  it('rejects an HTTP node that is not offered to the agent', () => {
    expect(isHttpAgentToolNode({ type: 'http_request', data: { url: 'https://example.com' } })).toBe(false);
    expect(isHttpAgentToolNode({ type: 'tool_node', data: { toolKind: 'get-rag' } })).toBe(false);
  });
});
