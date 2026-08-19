import { interpolate, runHttpRequest } from '../../execution/node-runtime.js';
import { resolveCredential } from '../../storage/credentials.js';
import { WORKFLOW_INTEGRATIONS } from '../../integrations/integrations.js';
import type { NodeContext, NodeOutput } from '../types.js';

export async function executeActionInApp(ctx: NodeContext): Promise<NodeOutput> {
  const data = (ctx.node.data ?? {}) as Record<string, unknown>;
  const actionId = String(data.actionId ?? data.action ?? 'noop');
  const integrationId = String(data.integrationId ?? '');
  const scope: Record<string, unknown> = {
    ...ctx.nodeInput,
    $json: ctx.nodeInput,
    json: ctx.nodeInput,
    text: ctx.nodeInput.text ?? ctx.input ?? '',
    input: ctx.input ?? '',
    variables: ctx.runContext.variables ?? {},
  };

  const preset = WORKFLOW_INTEGRATIONS.find((p) => p.id === integrationId);
  const url = String(data.url ?? preset?.node.url ?? '').trim();
  const method = String(data.method ?? preset?.node.method ?? '').trim();

  if (url && url !== 'https://' && method) {
    const credentialKey = String(data.credentialId ?? data.credentialKey ?? '');
    const credential = credentialKey
      ? await resolveCredential(ctx.userDO, ctx.c.env, credentialKey)
      : null;
    const httpData = {
      method,
      url,
      headers: (data.headers as Record<string, unknown> | undefined) ?? preset?.node.headers ?? {},
      body: data.body ?? preset?.node.body,
      jsonResponse: data.jsonResponse ?? preset?.node.jsonResponse,
      timeoutMs: data.timeoutMs,
    };
    const result = await runHttpRequest(httpData, scope, credential);
    if (!result.ok && data.failOnError !== false) {
      throw new Error(`${integrationId || actionId} failed with status ${result.status}`);
    }
    return {
      action: actionId,
      integrationId,
      ok: result.ok,
      status: result.status,
      data: result.body,
      text: result.text,
    };
  }

  const to = String(interpolate(String(data.to ?? (scope.variables as Record<string, unknown> | undefined)?.to ?? ''), scope) ?? '');
  const subject = String(
    interpolate(String(data.subject ?? 'Workflow completed'), scope) ?? 'Workflow completed',
  );
  const body = String(
    interpolate(String(data.body ?? data.message ?? '{{ text }}'), scope) ?? ctx.nodeInput.text ?? '',
  );

  return {
    ...ctx.nodeInput,
    action: actionId,
    integrationId,
    ok: true,
    skipped: !url,
    result: `${actionId} recorded`,
    notification: {
      channel: integrationId || actionId,
      to: to || undefined,
      subject,
      body,
    },
  };
}
