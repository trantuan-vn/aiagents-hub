import { describe, expect, it } from 'vitest';

import { interpolate, ExpressionError } from '@aiagents-hub/workflow-nodes';

describe('interpolate expressions', () => {
  const webhookScope = {
    body: { question: 'from webhook' },
    $json: { body: { question: 'from webhook' } },
  };
  const chatScope = {
    chatInput: 'from chat',
    $json: { chatInput: 'from chat' },
  };
  const bothEmpty = { body: {}, chatInput: '', $json: { body: {}, chatInput: '' } };

  it('keeps || first-truthy for dual-trigger fields', () => {
    expect(interpolate('{{ $json.body.question || $json.chatInput }}', webhookScope)).toBe('from webhook');
    expect(interpolate('{{ $json.body.question || $json.chatInput }}', chatScope)).toBe('from chat');
  });

  it('returns empty when every || operand is empty', () => {
    expect(interpolate('{{ $json.body.question || $json.chatInput }}', bothEmpty)).toBe('');
  });

  it('still concatenates adjacent {{ }} blocks', () => {
    expect(interpolate('{{ $json.body.question }}{{ $json.chatInput }}', chatScope)).toBe('from chat');
  });

  it('supports ?? nullish coalescing', () => {
    expect(interpolate('{{ $json.missing ?? $json.chatInput }}', chatScope)).toBe('from chat');
    expect(interpolate("{{ $json.chatInput ?? 'fallback' }}", chatScope)).toBe('from chat');
    expect(interpolate("{{ $json.chatInput ?? 'fallback' }}", { chatInput: '', $json: { chatInput: '' } })).toBe('');
  });

  it('supports &&', () => {
    expect(interpolate('{{ $json.ok && $json.chatInput }}', { ok: true, chatInput: 'from chat', $json: { ok: true, chatInput: 'from chat' } })).toBe('from chat');
    expect(interpolate('{{ $json.ok && $json.chatInput }}', { ok: false, chatInput: 'from chat', $json: { ok: false, chatInput: 'from chat' } })).toBe(false);
  });

  it('supports ternary', () => {
    const scope = { source: 'chat', chatInput: 'hi', body: { question: 'q' }, $json: { source: 'chat', chatInput: 'hi', body: { question: 'q' } } };
    expect(interpolate("{{ $json.source === 'chat' ? $json.chatInput : $json.body.question }}", scope)).toBe('hi');
  });

  it('supports comparisons, arithmetic, and parentheses', () => {
    const scope = { count: 3, $json: { count: 3 } };
    expect(interpolate('{{ $json.count > 2 && $json.count < 10 }}', scope)).toBe(true);
    expect(interpolate('{{ 1 + 2 * 3 }}', {})).toBe(7);
    expect(interpolate('{{ (1 + 2) * 3 }}', {})).toBe(9);
  });

  it('supports optional chaining, indexes, and string methods', () => {
    const scope = {
      items: [{ tableName: 'ORDERS' }],
      name: 'Ada',
      $json: { items: [{ tableName: 'ORDERS' }], name: 'Ada' },
    };
    expect(interpolate('{{ $json.items[0].tableName }}', scope)).toBe('ORDERS');
    expect(interpolate('{{ $json.missing?.tableName }}', scope)).toBeUndefined();
    expect(interpolate('{{ $json.name.toLowerCase() }}', scope)).toBe('ada');
  });

  it('supports typeof, Number, and mixed string templates', () => {
    const scope = { count: 4, $json: { count: 4 } };
    expect(interpolate("{{ typeof $json.count === 'number' }}", scope)).toBe(true);
    expect(interpolate("{{ Number('7') + $json.count }}", scope)).toBe(11);
    expect(interpolate('tables: {{ $json.count }}', scope)).toBe('tables: 4');
  });

  it('rejects mixing || and ?? without parentheses', () => {
    expect(() => interpolate('{{ $json.a || $json.b ?? $json.c }}', { $json: {} })).toThrow(ExpressionError);
    expect(interpolate('{{ ($json.a || $json.b) ?? $json.c }}', { a: '', b: 'b', c: 'c', $json: { a: '', b: 'b', c: 'c' } })).toBe('b');
  });

  it('blocks constructor access', () => {
    expect(interpolate('{{ constructor }}', { $json: {} })).toBeUndefined();
    expect(interpolate('{{ $json.constructor }}', { $json: { constructor: 'nope' } })).toBeUndefined();
  });
});
