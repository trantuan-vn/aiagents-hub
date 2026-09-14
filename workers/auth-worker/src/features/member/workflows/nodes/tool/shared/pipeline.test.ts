import { describe, expect, it } from 'vitest';

import { GET_RAG_QUERY_FIELD, REASONING_AGENT_PROMPT } from '@aiagents-hub/workflow-nodes';

import { resolveAgentUserText } from '../../agent/shared.js';
import { resolveConfiguredText } from './pipeline.js';

describe('resolveConfiguredText', () => {
  it('uses the mapped Query field from a webhook body', () => {
    expect(
      resolveConfiguredText(GET_RAG_QUERY_FIELD, { body: { question: 'doanh thu 30 ngay' } }),
    ).toBe('doanh thu 30 ngay');
  });

  it('uses chatInput when the Query field points at body.question but chat sent chatInput', () => {
    expect(
      resolveConfiguredText('{{ $json.body.question }}', {
        chatInput: 'thong tin so du NDT',
        sessionId: 's1',
      }),
    ).toBe('thong tin so du NDT');
  });

  it('reads a plain-string webhook body when Query field is $json.body', () => {
    expect(resolveConfiguredText('{{ $json.body }}', { body: 'list orders' })).toBe('list orders');
  });
});

describe('resolveAgentUserText', () => {
  it('interpolates the Reasoning Agent prompt from chatInput', () => {
    expect(
      resolveAgentUserText(
        { prompt: REASONING_AGENT_PROMPT },
        { chatInput: 'thong tin so du', sessionId: 's1' },
      ),
    ).toBe('thong tin so du');
  });

  it('keeps a static prompt that is not an expression', () => {
    expect(
      resolveAgentUserText({ prompt: 'Summarize this table' }, { chatInput: 'ignored' }),
    ).toBe('Summarize this table');
  });

  it('fills {{ $json.ragText }} after retrieve writes it onto input', () => {
    expect(
      resolveAgentUserText(
        { prompt: 'Q: {{ $json.chatInput }}\n\n{{ $json.ragText }}' },
        { chatInput: 'so du', ragText: 'CREATE TABLE ADMIN.BALANCES' },
      ),
    ).toContain('CREATE TABLE ADMIN.BALANCES');
  });
});
