import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition } from '../domain/domain.js';
import {
  getWorkflowEntryNodeIds,
  isEmptyNodeInput,
  isNonExecutableNode,
  isToolNodeOnDataFlow,
  parseWorkflowExecuteInput,
} from './graph-helpers.js';
import { extractLoopItems, executeLoopOverItems } from './loop-helpers.js';

describe('loop connection passthrough', () => {
  it('forwards Oracle credentials onto each batch output', () => {
    const result = executeLoopOverItems(
      { batchSize: 1 },
      {
        items: [{ tableName: 'ORDERS' }, { tableName: 'USERS' }],
        schemaName: 'ADMIN',
        connection: { type: 'oracle', user: 'ADMIN', password: 'secret', connectString: 'dsn' },
        user: 'ADMIN',
        password: 'secret',
        connectString: 'dsn',
        tables: ['ORDERS', 'USERS'],
      },
      undefined,
      false,
    );
    expect(result.output.items).toEqual([{ tableName: 'ORDERS' }]);
    expect(result.output.user).toBe('ADMIN');
    expect(result.output.password).toBe('secret');
    expect(result.output.connectString).toBe('dsn');
    expect(result.output.tables).toEqual(['ORDERS', 'USERS']);
    expect(result.loopState?.connectionCtx?.password).toBe('secret');
  });
});

const generateVector: WorkflowDefinition = {
  nodes: [
    { id: 'form', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'form' } },
    { id: 'dbinfo', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-db-info' } },
    { id: 'loop', type: 'flow', position: { x: 0, y: 0 }, data: { flowKind: 'loop_over_items' } },
    { id: 'save', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'save-rag' } },
    { id: 'gmail', type: 'action_in_app', position: { x: 0, y: 0 }, data: { integrationId: 'gmail' } },
    { id: 'svc', type: 'service_node', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [
    { id: 'e1', source: 'form', target: 'dbinfo', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e2', source: 'dbinfo', target: 'loop', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e3', source: 'loop', target: 'save', sourceHandle: 'loop', targetHandle: 'in' },
    { id: 'e4', source: 'save', target: 'loop', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e5', source: 'loop', target: 'gmail', sourceHandle: 'done', targetHandle: 'in' },
  ],
};

const generateSql: WorkflowDefinition = {
  nodes: [
    { id: 'wh', type: 'trigger', position: { x: 0, y: 0 }, data: { triggerKind: 'webhook' } },
    { id: 'getrag', type: 'tool_node', position: { x: 0, y: 0 }, data: { toolKind: 'get-rag' } },
    { id: 'agent', type: 'agent', position: { x: 0, y: 0 }, data: {} },
    { id: 'http', type: 'http_request', position: { x: 0, y: 0 }, data: { url: '' } },
    { id: 'svc', type: 'service_node', position: { x: 0, y: 0 }, data: { endpoint: '/chat' } },
  ],
  edges: [
    { id: 'e1', source: 'wh', target: 'getrag', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e2', source: 'getrag', target: 'agent', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e3', source: 'agent', target: 'http', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e4', source: 'svc', target: 'agent', sourceHandle: 'service', targetHandle: 'service' },
  ],
};

describe('GENERATE VECTOR / GENERATE SQL graph wiring', () => {
  it('executes Get DB Info and Save RAG on the data-flow path', () => {
    expect(isToolNodeOnDataFlow(generateVector, 'dbinfo')).toBe(true);
    expect(isToolNodeOnDataFlow(generateVector, 'save')).toBe(true);
    expect(isNonExecutableNode({ id: 'dbinfo', type: 'tool_node' }, generateVector)).toBe(false);
    expect(isNonExecutableNode({ id: 'save', type: 'tool_node' }, generateVector)).toBe(false);
    expect(isNonExecutableNode({ id: 'svc', type: 'service_node' }, generateVector)).toBe(true);
    expect(getWorkflowEntryNodeIds(generateVector)).toEqual(['form']);
  });

  it('executes Get RAG on the data-flow path before Agent on GENERATE SQL', () => {
    expect(isToolNodeOnDataFlow(generateSql, 'getrag')).toBe(true);
    expect(isNonExecutableNode({ id: 'getrag', type: 'tool_node' }, generateSql)).toBe(false);
    expect(getWorkflowEntryNodeIds(generateSql)).toEqual(['wh']);
  });

  it('loop extracts table items from Get DB Info output', () => {
    const items = extractLoopItems({
      items: [
        { tableName: 'orders', schemaName: 'public' },
        { tableName: 'users', schemaName: 'public' },
      ],
      tableCount: 2,
      parents: {},
    });
    expect(items).toHaveLength(2);
    expect((items[0] as { tableName: string }).tableName).toBe('orders');
  });
});

describe('execute-step input fallback', () => {
  it('parses JSON input from a previous form node', () => {
    const parsed = parseWorkflowExecuteInput(
      JSON.stringify({ u: 'ADMIN', p: 'secret', c: 'dbname_high', fields: { u: 'ADMIN' } }),
    );
    expect(parsed.u).toBe('ADMIN');
    expect(isEmptyNodeInput({ parents: { form: {} } })).toBe(true);
    expect(isEmptyNodeInput({ u: 'ADMIN', parents: { form: {} } })).toBe(false);
  });
});
