import { describe, expect, it } from 'vitest';

import {
  buildWebhookItemOutput,
  normalizeWebhookIngressBody,
  parseWebhookRequest,
  resolveWebhookQuestion,
} from './output.js';

describe('resolveWebhookQuestion', () => {
  it('prefers body.question', () => {
    expect(resolveWebhookQuestion({ question: 'from question', message: 'from message' })).toBe(
      'from question',
    );
  });

  it('falls back to message, query, and text', () => {
    expect(resolveWebhookQuestion({ message: 'Số dư của NĐT Nguyễn Văn A' })).toBe(
      'Số dư của NĐT Nguyễn Văn A',
    );
    expect(resolveWebhookQuestion({ query: 'revenue' })).toBe('revenue');
    expect(resolveWebhookQuestion({ text: 'hello' })).toBe('hello');
  });
});

describe('normalizeWebhookIngressBody', () => {
  it('copies message onto question', () => {
    expect(normalizeWebhookIngressBody({ message: 'hello' })).toEqual({
      message: 'hello',
      question: 'hello',
    });
  });

  it('does not overwrite an existing question', () => {
    expect(normalizeWebhookIngressBody({ question: 'keep', message: 'other' })).toEqual({
      question: 'keep',
      message: 'other',
    });
  });
});

describe('buildWebhookItemOutput', () => {
  it('exposes body.question and chatInput from message', () => {
    const item = buildWebhookItemOutput({
      webhookUrl: 'https://api.example.com/hooks/workflows/1/wh',
      body: { message: 'Số dư của NĐT Nguyễn Văn A' },
      executionMode: 'production',
    });
    expect((item.body as { question: string }).question).toBe('Số dư của NĐT Nguyễn Văn A');
    expect(item.chatInput).toBe('Số dư của NĐT Nguyễn Văn A');
  });
});

describe('parseWebhookRequest', () => {
  it('maps JSON message to body.question', async () => {
    const request = new Request('https://api.example.com/hooks/workflows/19/wh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Số dư của NĐT Nguyễn Văn A' }),
    });
    const { itemParams } = await parseWebhookRequest(request, { input: null }, { executionMode: 'production' });
    expect((itemParams.body as { question: string }).question).toBe('Số dư của NĐT Nguyễn Văn A');
  });
});
