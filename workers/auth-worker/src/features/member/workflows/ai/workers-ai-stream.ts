import { noteAgentWork, pushAgentActivityText } from '../execution/execution-progress.js';

export type WorkersAiStreamAssembly = {
  content: string;
  reasoning: string;
  finishReason: string;
  usage?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

/** Pull one SSE payload into the assembled reply. Returns the text to show the user. */
export function absorbWorkersAiStreamPayload(state: WorkersAiStreamAssembly, payload: unknown): string {
  const record = asRecord(payload);
  if (!record) return '';
  const usage = asRecord(record.usage);
  if (usage && ('prompt_tokens' in usage || 'completion_tokens' in usage || 'inputTokens' in usage)) {
    state.usage = usage;
  }
  const choice = Array.isArray(record.choices) ? asRecord(record.choices[0]) : null;
  const finish = stringField(choice, 'finish_reason');
  if (finish) state.finishReason = finish;
  const delta = asRecord(choice?.delta) ?? asRecord(choice?.message);
  const reasoning =
    stringField(delta, 'reasoning_content') || stringField(delta, 'reasoning') || stringField(record, 'reasoning');
  const content =
    stringField(delta, 'content') ||
    stringField(record, 'response') ||
    (typeof record.delta === 'string' ? record.delta : '');
  if (reasoning) state.reasoning += reasoning;
  if (content) state.content += content;
  return `${reasoning}${content}`;
}

export function workersAiResponseFromAssembly(state: WorkersAiStreamAssembly, promptText: string): unknown {
  const usage = state.usage ?? {
    prompt_tokens: Math.max(1, Math.ceil(promptText.length / 4)),
    completion_tokens: Math.ceil((state.content.length + state.reasoning.length) / 4),
  };
  return {
    choices: [
      {
        finish_reason: state.finishReason || 'stop',
        message: {
          content: state.content,
          ...(state.reasoning ? { reasoning_content: state.reasoning } : {}),
        },
      },
    ],
    usage,
  };
}

export function isReadableByteStream(value: unknown): value is ReadableStream<Uint8Array> {
  return !!value && typeof value === 'object' && typeof (value as ReadableStream<Uint8Array>).getReader === 'function';
}

/** Read a Workers AI `stream: true` body and forward each text delta to the chat. */
export async function readWorkersAiEventStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  promptText: string,
): Promise<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const state: WorkersAiStreamAssembly = { content: '', reasoning: '', finishReason: '' };
  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const delta = absorbWorkersAiStreamPayload(state, JSON.parse(payload) as unknown);
      if (delta) onDelta(delta);
    } catch {
      /* partial frame */
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);
  return workersAiResponseFromAssembly(state, promptText);
}

type AgentStreamPart = {
  type?: string;
  text?: string;
  toolName?: string;
};

/** Forward AI SDK fullStream parts into the chat activity log. */
export async function followAgentStream(stream: AsyncIterable<AgentStreamPart>): Promise<void> {
  for await (const part of stream) {
    if (part.type === 'reasoning-delta' && part.text) {
      pushAgentActivityText(part.text);
      continue;
    }
    if (part.type === 'text-delta' && part.text) {
      pushAgentActivityText(part.text);
      continue;
    }
    if (part.type === 'tool-call' && part.toolName) {
      noteAgentWork('tool', part.toolName);
    }
  }
}
