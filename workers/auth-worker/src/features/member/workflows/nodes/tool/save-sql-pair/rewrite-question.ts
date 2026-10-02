import {
  asBillingAiResponse,
  billAgentUsage,
  ensureWalletBalance,
  extractTextFromAiResponse,
  getModelForService,
  resolveServiceByEndpoint,
  runTextModel,
} from '../../../billing/billing.js';
import { reportUsageCharge } from '../../../billing/charge.js';
import { resolveServiceOnHandle } from '../../../engine/graph-helpers.js';
import { assertTextGenerationModel } from '../../agent/shared.js';
import type { NodeContext } from '../../types.js';
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

/** Keep a single question. Drop fences, a wrapping quote, and a leading "Question:" label. */
export function cleanRewrittenQuestion(raw: string): string {
  let text = String(raw ?? '').trim();
  text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('“') && text.endsWith('”'))
  ) {
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^question\s*:\s*/i, '').trim();
  if (!text || text.length > 2000) return '';
  if (/^\s*(select|with)\b/i.test(text)) return '';
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

  const maxTokens = 512;
  const temperature = linked.serviceOptions?.temperature != null ? Number(linked.serviceOptions.temperature) : 0.2;
  const aiResponse = await runTextModel(
    ctx.c.env,
    modelId,
    [
      { role: 'system', content: system },
      { role: 'user', content: `Question:\n${question}\n\nSQL:\n${sql}` },
    ],
    maxTokens,
    { temperature, max_completion_tokens: maxTokens },
  );
  const text = extractTextFromAiResponse(aiResponse);
  const billing = ragBillingFromNodeContext(ctx);
  if (billing) {
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
  }

  const rewritten = cleanRewrittenQuestion(text);
  if (!rewritten) throw new Error('save_sql_pair: rewritten question is empty');
  return { question: rewritten, llmCalls: 1 };
}
