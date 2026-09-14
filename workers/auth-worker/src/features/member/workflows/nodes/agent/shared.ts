import { interpolate } from '../../execution/node-runtime.js';
import { DEFAULT_EMBED_MODEL } from '../../rag/index.js';
import type { NodeContext } from '../types.js';

export function aiParamsFromServiceOptions(opts?: Record<string, unknown>): Record<string, unknown> {
  if (!opts) return {};
  const out: Record<string, unknown> = {};
  if (opts.temperature != null && opts.temperature !== '') out.temperature = Number(opts.temperature);
  if (opts.topP != null && opts.topP !== '') out.top_p = Number(opts.topP);
  if (opts.frequencyPenalty != null && opts.frequencyPenalty !== '') {
    out.frequency_penalty = Number(opts.frequencyPenalty);
  }
  if (opts.presencePenalty != null && opts.presencePenalty !== '') {
    out.presence_penalty = Number(opts.presencePenalty);
  }
  if (opts.responseFormat === 'json_object') out.response_format = { type: 'json_object' };
  return out;
}

export function isReasoningModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.includes('glm') ||
    id.includes('think') ||
    id.includes('reason') ||
    id.includes('qwq') ||
    id.includes('deepseek-r1')
  );
}

export function resolveMaxTokens(
  agentData: Record<string, unknown>,
  serviceOptions?: Record<string, unknown>,
  modelId = '',
): number {
  const fallback = isReasoningModel(modelId) ? 4096 : 1024;
  const fromService = serviceOptions?.maxTokens;
  const raw = fromService ?? agentData.maxTokens ?? fallback;
  return Number(raw) || fallback;
}

/** Embedding models cannot be used with generateText / chat completions. */
export function assertTextGenerationModel(modelId: string): void {
  const id = modelId.toLowerCase();
  if (id.includes('bge') || id.includes('embed')) {
    throw new Error(
      `Agent requires a text generation model (e.g. @cf/meta/llama-3.1-8b-instruct), but the connected service uses embedding model "${modelId}". Connect an LLM service to the Agent "Service" handle; keep embedding models for Memory/RAG tools only.`,
    );
  }
}

export function resolveEmbedModel(service: Record<string, unknown>): string {
  const catalog = String(service.catalogId ?? service.catalog_id ?? '').trim();
  if (catalog.includes('bge')) return DEFAULT_EMBED_MODEL;
  const model = String(service.embedModel ?? service.embed_model ?? '').trim();
  return model || DEFAULT_EMBED_MODEL;
}

export function resolveAgentUserText(
  data: Record<string, unknown>,
  nodeInput: Record<string, unknown>,
  fallbackInput?: string,
): string {
  const prompt = String(data.prompt ?? '');
  const scope = { ...nodeInput, $json: nodeInput, json: nodeInput, input: fallbackInput ?? '' };

  if (prompt.includes('{{')) {
    const resolved = interpolate(prompt, scope);
    if (resolved != null && String(resolved).trim()) return String(resolved);
    return '';
  }

  if (prompt.trim()) return prompt;
  return String(fallbackInput ?? '').trim();
}

export function extractSql(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') && /"choices"\s*:/.test(trimmed)) return '';

  const fenced = trimmed.match(/```sql\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const generic = trimmed.match(/```\s*([\s\S]*?)```/);
  if (generic?.[1] && /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i.test(generic[1])) {
    return generic[1].trim();
  }
  const select = trimmed.match(/\b((?:WITH|SELECT)\b[\s\S]{12,8000}?)(?:;|$)/i);
  if (select?.[1]?.trim()) {
    const sql = select[1].trim();
    return /;$/.test(sql) ? sql : `${sql};`;
  }
  if (/^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)\b/i.test(trimmed) && trimmed.length < 8000) {
    return trimmed;
  }
  return '';
}

export function withoutGetRagTools<T extends Record<string, unknown>>(tools: T): T {
  const out = { ...tools };
  for (const key of Object.keys(out)) {
    const normalized = key.replace(/-/g, '_');
    if (normalized === 'get_rag' || normalized.endsWith('_get_rag')) {
      delete out[key];
    }
  }
  return out;
}

export function interpolateTemplate(template: string, scope: Record<string, unknown>): string {
  if (!template.includes('{{')) return template;
  const resolved = interpolate(template, scope);
  if (resolved == null) return '';
  return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
}

export function extractTriggerContext(ctx: NodeContext): Record<string, unknown> {
  const input = ctx.nodeInput ?? {};
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export function isReasoningAgentKind(data: Record<string, unknown>): boolean {
  return String(data.agentKind ?? '') === 'reasoning_agent';
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
