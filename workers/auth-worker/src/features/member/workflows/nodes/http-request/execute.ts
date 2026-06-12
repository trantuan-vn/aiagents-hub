import { resolveCredential } from '../../credentials.js';
import { runHttpRequest } from '../../node-runtime.js';
import type { NodeContext, NodeOutput } from '../types.js';

export async function executeHttpRequest(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const scope: Record<string, unknown> = {
    ...ctx.nodeInput,
    input: ctx.input ?? '',
    variables: ctx.runContext.variables ?? {},
  };
  const credentialKey = String(data.credentialId ?? data.credentialKey ?? '');
  const credential = credentialKey
    ? await resolveCredential(ctx.userDO, ctx.c.env, credentialKey)
    : null;
  const result = await runHttpRequest(data, scope, credential);
  if (!result.ok && data.failOnError !== false) {
    throw new Error(`HTTP request failed with status ${result.status}`);
  }
  const text =
    result.text ??
    (typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
  return { status: result.status, ok: result.ok, headers: result.headers, data: result.body, text };
}
