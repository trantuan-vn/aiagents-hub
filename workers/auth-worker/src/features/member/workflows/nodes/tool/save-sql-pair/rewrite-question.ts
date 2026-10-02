import {
  asBillingAiResponse,
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  finishReasonFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../../billing/billing.js';
import { reportUsageCharge } from '../../../billing/charge.js';
import { resolveServiceOnHandle } from '../../../engine/graph-helpers.js';
import { assertTextGenerationModel, isReasoningModel } from '../../agent/shared.js';
import type { NodeContext } from '../../types.js';
import { stampFromNode } from '../../../ai/workers-ai.js';
import { ragBillingFromNodeContext } from '../shared/rag-context.js';

const REWRITE_RULES = `Rewrite the question for text-to-SQL retrieval.
Return ONLY the rewritten question. No markdown, no SQL, no explanation.
Rules:
- These rules override any earlier instruction to answer, write SQL, or return JSON.
- One question, or a few clauses, stating the metric, grouping, filters, and period already present in the question or the SQL.
- Use the domain terms from the instructions above.
- Do not invent table or column names that those instructions do not name.
- Do not answer the question.`;

/** Domain role first, then the rewrite rules. Blank prompt means do not call the LLM. */
export function composeRewriteSystem(describeSystemPrompt: unknown): string {
  const domain = String(describeSystemPrompt ?? '').trim();
  if (!domain) return '';
  return `${domain}\n\n${REWRITE_RULES}`;
}

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;
const ANALYSIS =
  /\b(I need to|I should|The user wants|The user question|The rules say|Let me|something like)\b/i;
const THINKING_PARAM_REJECT = /chat_template|enable_thinking|unknown parameter|unrecognized/i;

function stripThink(text: string): string {
  return text.replace(THINK_BLOCK, ' ').replace(/<\/?think>/gi, ' ').trim();
}

function unwrap(text: string): string {
  let next = text.trim();
  next = next.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  if (
    (next.startsWith('"') && next.endsWith('"')) ||
    (next.startsWith("'") && next.endsWith("'")) ||
    (next.startsWith('“') && next.endsWith('”'))
  ) {
    next = next.slice(1, -1).trim();
  }
  next = next.replace(/^question\s*:\s*/i, '').trim();
  return next;
}

function isSql(text: string): boolean {
  return /^\s*(select|with)\b/i.test(text);
}

function looksLikeAnalysis(text: string): boolean {
  return ANALYSIS.test(text);
}

/** Reasoning traces often contain a finished draft in quotes, then a second draft cut off by the token cap. */
function lastClosedQuote(text: string): string {
  const re = /["“]([^"“”]{8,2000})["”]/g;
  let last = '';
  for (const match of text.matchAll(re)) {
    const quote = unwrap(match[1] ?? '');
    if (!quote || quote.length > 2000 || isSql(quote) || looksLikeAnalysis(quote)) continue;
    last = quote;
  }
  return last;
}

/** Keep a single question. Drop fences, a wrapping quote, a leading "Question:" label, and chain-of-thought. */
export function cleanRewrittenQuestion(raw: string): string {
  const source = String(raw ?? '');
  const text = unwrap(stripThink(source));
  if (!text) return '';
  if (looksLikeAnalysis(text)) return lastClosedQuote(source);
  if (text.length > 2000 || isSql(text)) return '';
  return text;
}

export type RewrittenQuestion = {
  question: string;
  llmCalls: number;
};

/**
 * When System prompt is set, the linked chat model rewrites the question with those terms.
 * The vector uses that text. A blank prompt keeps the original question and does not call the LLM.
 */
export async function rewriteSqlPairQuestion(
  ctx: NodeContext,
  question: string,
  sql: string,
): Promise<RewrittenQuestion> {
  const system = composeRewriteSystem(
    (ctx.node.data as Record<string, unknown> | undefined)?.describeSystemPrompt,
  );
  if (!system) return { question, llmCalls: 0 };

  const linked = resolveServiceOnHandle(ctx.definition, ctx.node.id, 'llm');
  const endpoint = String(linked.endpoint ?? '').trim();
  if (!endpoint) {
    throw new Error('save_sql_pair: connect a chat Service to the LLM handle before rewriting questions');
  }
  if (!ctx.userDO) throw new Error('save_sql_pair: user session is required to call the LLM');

  await ensureWalletBalance(ctx.userDO, ctx.c.env);
  const service = await resolveServiceByEndpoint(ctx.userDO, endpoint);
  const modelId = getModelForService(service);
  assertTextGenerationModel(
    modelId,
    'Save SQL Pair: connect a chat model Service to the "LLM" handle. Pick the embedding model in the "Embed model" field, or clear System prompt to skip the rewrite.',
  );

  const temperature = linked.serviceOptions?.temperature != null ? Number(linked.serviceOptions.temperature) : 0.2;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Question:\n${question}\n\nSQL:\n${sql}` },
  ];
  const billing = ragBillingFromNodeContext(ctx);
  let llmCalls = 0;

  const bill = async (aiResponse: unknown, text: string) => {
    if (!billing) return;
    const charge = await billAgentUsage(
      billing.env,
      billing.bindingName,
      billing.userDO,
      billing.consumerIdentifier,
      service,
      {
        endpoint,
        aiResponse: asBillingAiResponse(aiResponse, text),
        userAgent: billing.requestMeta?.userAgent,
        ipAddress: billing.requestMeta?.ipAddress,
        workflowAttribution: billing.workflowAttribution
          ? {
              workflowId: billing.workflowAttribution.workflowId,
              workflowOwnerId: billing.workflowAttribution.workflowOwnerId,
            }
          : undefined,
        executionKey: billing.executionKey,
      },
    );
    reportUsageCharge(billing.onCost, charge);
  };

  // GLM puts the answer after a thinking trace. A 512 cap is spent on reasoning_content,
  // finish_reason becomes "length", and content stays empty.
  const completeOnce = async (maxTokens: number, disableThinking: boolean) => {
    const plain = { temperature, max_completion_tokens: maxTokens };
    const extra: Record<string, unknown> = disableThinking
      ? { ...plain, chat_template_kwargs: { enable_thinking: false } }
      : plain;
    let aiResponse: unknown;
    try {
      aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens, extra, stampFromNode(ctx, 'text'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!disableThinking || !THINKING_PARAM_REJECT.test(message)) throw error;
      aiResponse = await runTextModel(ctx.c.env, modelId, messages, maxTokens, plain, stampFromNode(ctx, 'text'));
    }
    llmCalls += 1;
    const text = extractTextFromAiResponse(aiResponse);
    await bill(aiResponse, text);
    return { text, finish: finishReasonFromAiResponse(aiResponse) };
  };

  const disableThinking = modelId.toLowerCase().includes('glm');
  let maxTokens = isReasoningModel(modelId) ? 2048 : 512;
  let result = await completeOnce(maxTokens, disableThinking);
  let rewritten = cleanRewrittenQuestion(result.text);
  const cutOff =
    !rewritten &&
    !isSql(result.text) &&
    (result.finish === 'length' || looksLikeAnalysis(result.text));
  if (cutOff && maxTokens < 4096) {
    maxTokens = 4096;
    result = await completeOnce(maxTokens, true);
    rewritten = cleanRewrittenQuestion(result.text);
  }
  if (!rewritten) throw new Error('save_sql_pair: rewritten question is empty');
  return { question: rewritten, llmCalls };
}
