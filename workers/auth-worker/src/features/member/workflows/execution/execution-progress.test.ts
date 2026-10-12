import { describe, expect, it } from 'vitest';

import { absorbWorkersAiStreamPayload, readWorkersAiEventStream } from '../ai/workers-ai-stream.js';
import {
  appendAgentActivity,
  broadcastWorkflowExecutionProgress,
  noteAgentWork,
  progressNodeLabel,
  pushAgentActivityText,
  reportAgentReasoning,
  subscribeExecutionProgress,
  toPublicChatProgress,
  withAgentActivity,
  type WorkflowExecutionProgressEvent,
} from './execution-progress.js';

describe('execution progress for chat logs', () => {
  it('labels a node from its display name, then its kind', () => {
    expect(progressNodeLabel({ type: 'agent', data: { label: 'SQL agent', agentKind: 'reasoning_agent' } })).toBe(
      'SQL agent',
    );
    expect(progressNodeLabel({ type: 'agent', data: { agentKind: 'reasoning_agent' } })).toBe('reasoning agent');
    expect(progressNodeLabel({ type: 'tool_node', data: {} })).toBe('tool node');
  });

  it('strips input and output before a public chat event', () => {
    const event: WorkflowExecutionProgressEvent = {
      type: 'node_done',
      workflowId: 4,
      executionKey: 'secret-key',
      nodeId: 'n1',
      nodeType: 'agent',
      label: 'Agent',
      status: 'success',
      input: { chatInput: 'hidden' },
      output: { text: 'hidden' },
    };
    expect(toPublicChatProgress(event)).toEqual({
      type: 'node_done',
      nodeId: 'n1',
      nodeType: 'agent',
      label: 'Agent',
      status: 'success',
    });
  });

  it('notifies a subscriber when an agent starts reasoning', async () => {
    const seen: WorkflowExecutionProgressEvent[] = [];
    await subscribeExecutionProgress(
      (event) => {
        seen.push(event);
      },
      () =>
        reportAgentReasoning({
          node: { id: 'agent_1', type: 'agent', data: { label: 'Reasoning' } },
          userDO: {} as never,
          meta: { workflowId: 9 },
          executionKey: 'exec-1',
        }),
    );
    expect(seen).toEqual([
      {
        type: 'node_phase',
        workflowId: 9,
        executionKey: 'exec-1',
        nodeId: 'agent_1',
        nodeType: 'agent',
        label: 'Reasoning',
        phase: 'reasoning',
        status: 'running',
      },
    ]);
  });

  it('streams model text onto the current stage', async () => {
    const seen: WorkflowExecutionProgressEvent[] = [];
    await subscribeExecutionProgress(
      (event) => {
        seen.push(event);
      },
      () =>
        withAgentActivity(
          {
            node: { id: 'agent_1', type: 'agent', data: { label: 'Agent' } },
            userDO: {} as never,
            meta: { workflowId: 3 },
            executionKey: 'exec-3',
          },
          async () => {
            noteAgentWork('sql');
            pushAgentActivityText('SELECT ');
            pushAgentActivityText('1');
          },
        ),
    );
    expect(seen.at(-1)?.activityLog).toEqual([{ work: 'sql', text: 'SELECT 1' }]);
  });

  it('keeps a short preview when the model moves to the next stage', () => {
    const items = appendAgentActivity(
      [{ work: 'rewrite', text: 'doanh thu theo tháng trong năm' }],
      { work: 'sql', text: 'SELECT' },
    );
    expect(items[0]?.text.length).toBeLessThanOrEqual(160);
    expect(items[1]).toEqual({ work: 'sql', text: 'SELECT' });
  });

  it('assembles reasoning and answer tokens from a Workers AI stream', async () => {
    const state = { content: '', reasoning: '', finishReason: '' };
    expect(
      absorbWorkersAiStreamPayload(state, {
        choices: [{ delta: { reasoning_content: 'đang chọn bảng orders' } }],
      }),
    ).toBe('đang chọn bảng orders');
    expect(absorbWorkersAiStreamPayload(state, { response: 'SELECT 1' })).toBe('SELECT 1');
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"SELECT "}}]}\n\n'));
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"1"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2}}\n\n',
          ),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const seen: string[] = [];
    const response = (await readWorkersAiEventStream(stream, (text) => seen.push(text), 'question')) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    expect(seen.join('')).toBe('SELECT 1');
    expect(response.choices[0]?.message.content).toBe('SELECT 1');
    expect(response.usage).toEqual({ prompt_tokens: 4, completion_tokens: 2 });
  });

  it('still notifies when the durable object broadcast fails', async () => {
    const seen: string[] = [];
    await subscribeExecutionProgress(
      (event) => {
        seen.push(event.type);
      },
      () =>
        broadcastWorkflowExecutionProgress(
          { fetch: async () => new Response('no', { status: 500 }) } as never,
          { type: 'node_start', workflowId: 1, executionKey: 'k', nodeId: 'a', status: 'running' },
        ),
    );
    expect(seen).toEqual(['node_start']);
  });
});
