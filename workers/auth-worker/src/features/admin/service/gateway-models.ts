import type { ModelSearchResult } from './domain';

/**
 * Popular models routed via Cloudflare AI Gateway (provider/model, not @cf Workers AI).
 * Merged into catalog scan so they appear as pending services even if CF search omits them.
 * Pricing is filled from CF catalog when available; otherwise set before approval.
 */
export const POPULAR_AI_GATEWAY_MODELS: ModelSearchResult[] = [
  { id: 'openai/gpt-5', name: 'GPT-5', source: 'gateway' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', source: 'gateway' },
  { id: 'openai/gpt-5-nano', name: 'GPT-5 Nano', source: 'gateway' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', source: 'gateway' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', source: 'gateway' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', source: 'gateway' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', source: 'gateway' },
  { id: 'openai/o3', name: 'OpenAI o3', source: 'gateway' },
  { id: 'openai/o4-mini', name: 'OpenAI o4-mini', source: 'gateway' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', source: 'gateway' },
  { id: 'anthropic/claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', source: 'gateway' },
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', source: 'gateway' },
  { id: 'anthropic/claude-3-5-haiku', name: 'Claude 3.5 Haiku', source: 'gateway' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', source: 'gateway' },
  { id: 'google-ai-studio/gemini-2.5-pro', name: 'Gemini 2.5 Pro', source: 'gateway' },
  { id: 'google-ai-studio/gemini-2.5-flash', name: 'Gemini 2.5 Flash', source: 'gateway' },
  { id: 'google-ai-studio/gemini-2.0-flash', name: 'Gemini 2.0 Flash', source: 'gateway' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', source: 'gateway' },
  { id: 'deepseek/deepseek-reasoner', name: 'DeepSeek Reasoner', source: 'gateway' },
  { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', source: 'gateway' },
  { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Groq)', source: 'gateway' },
  { id: 'grok/grok-4', name: 'Grok 4', source: 'gateway' },
  { id: 'cerebras/llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', source: 'gateway' },
  { id: 'mistral/mistral-large-latest', name: 'Mistral Large', source: 'gateway' },
  { id: 'x-ai/grok-2', name: 'Grok 2 (xAI)', source: 'gateway' },
];

export function listPopularAiGatewayModels(): ModelSearchResult[] {
  return POPULAR_AI_GATEWAY_MODELS.map((m) => ({ ...m }));
}

export function filterPopularGatewayModels(query: string): ModelSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR_AI_GATEWAY_MODELS.slice(0, 16);
  return POPULAR_AI_GATEWAY_MODELS.filter(
    (m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q),
  );
}
