import type { WorkflowDefinition } from '../domain/domain.js';
import { executeWorkflowGraph } from '../engine/executor.js';
import type { ResolvedWorkflow } from '../execution/workflow-context.js';
import { broadcastWorkflowWebhookResult } from './webhook-notify.js';

export type FormElementConfig = {
  id: string;
  label: string;
  fieldType: string;
  fieldName: string;
  placeholder?: string;
  requiredField?: boolean;
  multipleFiles?: boolean;
  acceptedFileTypes?: string;
  fieldOptions?: string;
};

export type FormSubmissionNodeData = {
  label?: string;
  triggerKind?: string;
  formKind?: string;
  formPath?: string;
  formTitle?: string;
  formDescription?: string;
  formElements?: FormElementConfig[];
  formResponseMode?: string;
  formResponseText?: string;
};

export function isFormSubmissionNode(node: WorkflowDefinition['nodes'][number]): boolean {
  if (node.type !== 'trigger') return false;
  const data = (node.data ?? {}) as FormSubmissionNodeData;
  return data.triggerKind === 'form' && data.formKind !== 'database';
}

export function resolveNodeFormPath(node: WorkflowDefinition['nodes'][number]): string {
  const data = (node.data ?? {}) as FormSubmissionNodeData;
  const custom = String(data.formPath ?? '').trim().replace(/^\/+/, '');
  return custom || node.id;
}

export function findFormSubmissionNodeByPath(
  definition: WorkflowDefinition,
  formPath: string,
): WorkflowDefinition['nodes'][number] | undefined {
  const normalized = formPath.trim().replace(/^\/+/, '');
  return definition.nodes.find((node) => {
    if (!isFormSubmissionNode(node)) return false;
    const path = resolveNodeFormPath(node);
    return path === normalized || node.id === normalized;
  });
}

export function listFormSubmissionNodes(definition: WorkflowDefinition) {
  return definition.nodes
    .filter(isFormSubmissionNode)
    .map((node) => ({ nodeId: node.id, formPath: resolveNodeFormPath(node) }));
}

export function buildFormSubmissionOutput(
  fields: Record<string, unknown>,
  meta?: { formUrl?: string; executionMode?: 'test' | 'production' },
): Record<string, unknown> {
  return {
    triggerKind: 'form',
    submittedAt: Date.now(),
    formUrl: meta?.formUrl ?? '',
    executionMode: meta?.executionMode ?? 'test',
    fields,
    ...fields,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function acceptedTypesAttr(value?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return ` accept="${escapeHtml(raw)}"`;
}

function renderField(el: FormElementConfig): string {
  const name = escapeHtml(el.fieldName || el.id);
  const label = escapeHtml(el.label || el.fieldName || 'Field');
  const placeholder = el.placeholder ? ` placeholder="${escapeHtml(el.placeholder)}"` : '';
  const required = el.requiredField ? ' required' : '';
  const id = escapeHtml(el.id);

  switch (el.fieldType) {
    case 'textarea':
      return `<label for="${id}">${label}</label><textarea id="${id}" name="${name}" rows="4"${placeholder}${required}></textarea>`;
    case 'number':
      return `<label for="${id}">${label}</label><input id="${id}" type="number" name="${name}"${placeholder}${required} />`;
    case 'email':
      return `<label for="${id}">${label}</label><input id="${id}" type="email" name="${name}"${placeholder}${required} />`;
    case 'password':
      return `<label for="${id}">${label}</label><input id="${id}" type="password" name="${name}"${placeholder}${required} />`;
    case 'date':
      return `<label for="${id}">${label}</label><input id="${id}" type="date" name="${name}"${required} />`;
    case 'hidden':
      return `<input type="hidden" name="${name}" value="" />`;
    case 'dropdown': {
      const options = String(el.fieldOptions ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const opts = options
        .map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
        .join('');
      return `<label for="${id}">${label}</label><select id="${id}" name="${name}"${required}>${opts}</select>`;
    }
    case 'file': {
      const multiple = el.multipleFiles ? ' multiple' : '';
      return `<label for="${id}">${label}</label><input id="${id}" type="file" name="${name}"${multiple}${acceptedTypesAttr(el.acceptedFileTypes)}${required} />`;
    }
    default:
      return `<label for="${id}">${label}</label><input id="${id}" type="text" name="${name}"${placeholder}${required} />`;
  }
}

export function renderFormPageHtml(params: {
  title: string;
  description?: string;
  elements: FormElementConfig[];
  actionUrl: string;
  method?: 'GET' | 'POST';
}): string {
  const title = escapeHtml(params.title || 'Form');
  const description = params.description
    ? `<p class="desc">${escapeHtml(params.description)}</p>`
    : '';
  const fields = params.elements.map((el) => `<div class="field">${renderField(el)}</div>`).join('\n');
  const method = params.method ?? 'POST';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f6f6; margin: 0; padding: 2rem 1rem; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    h1 { margin: 0 0 .5rem; font-size: 1.35rem; }
    .desc { color: #555; margin: 0 0 1.25rem; line-height: 1.5; }
    .field { margin-bottom: 1rem; display: flex; flex-direction: column; gap: .35rem; }
    label { font-size: .9rem; font-weight: 600; }
    input, textarea, select { font: inherit; padding: .55rem .65rem; border: 1px solid #ccc; border-radius: 8px; }
    button { margin-top: .5rem; width: 100%; padding: .7rem 1rem; border: 0; border-radius: 8px; background: #ff6f00; color: #fff; font-weight: 600; cursor: pointer; }
    button:hover { background: #e66300; }
    .success { text-align: center; padding: 2rem 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${description}
    <form method="${method}" action="${escapeHtml(params.actionUrl)}" enctype="multipart/form-data">
      ${fields}
      <button type="submit">Submit</button>
    </form>
  </div>
</body>
</html>`;
}

export function renderFormSuccessHtml(message: string): string {
  const text = escapeHtml(message || 'Your response has been recorded.');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Submitted</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f6f6; margin: 0; padding: 2rem 1rem; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); text-align: center; }
    h1 { margin: 0; font-size: 1.2rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card success"><h1>${text}</h1></div>
</body>
</html>`;
}

async function readFileField(file: File): Promise<Record<string, unknown>> {
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      error: 'File too large (max 5MB)',
    };
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const data = btoa(binary);
  return {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    data,
  };
}

/** Parse multipart or urlencoded form body into field map keyed by custom field names. */
export async function parseFormSubmissionRequest(
  request: Request,
  elements: FormElementConfig[],
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  const fields: Record<string, unknown> = {};

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    for (const el of elements) {
      const key = el.fieldName || el.id;
      if (el.fieldType === 'file') {
        const entries = el.multipleFiles ? formData.getAll(key) : [formData.get(key)];
        const files = entries.filter((v): v is File => v instanceof File && v.size > 0);
        if (!files.length) {
          fields[key] = el.multipleFiles ? [] : null;
          continue;
        }
        const parsed = await Promise.all(files.map((file) => readFileField(file)));
        fields[key] = el.multipleFiles ? parsed : parsed[0];
        continue;
      }
      const raw = formData.get(key);
      fields[key] = raw == null ? '' : String(raw);
    }
    return fields;
  }

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    for (const el of elements) {
      const key = el.fieldName || el.id;
      fields[key] = body[key] ?? '';
    }
    return fields;
  }

  const text = await request.text();
  const params = new URLSearchParams(text);
  for (const el of elements) {
    const key = el.fieldName || el.id;
    fields[key] = params.get(key) ?? '';
  }
  return fields;
}

export async function runFormSubmissionTrigger(params: {
  env: Env;
  bindingName: string;
  ownerId: string;
  resolved: ResolvedWorkflow;
  node: WorkflowDefinition['nodes'][number];
  fields: Record<string, unknown>;
  formUrl: string;
  executionMode: 'test' | 'production';
  autoApproveHumanReview?: boolean;
}): Promise<Awaited<ReturnType<typeof executeWorkflowGraph>>> {
  const output = buildFormSubmissionOutput(params.fields, {
    formUrl: params.formUrl,
    executionMode: params.executionMode,
  });
  const input = JSON.stringify(params.fields);

  return executeWorkflowGraph({
    c: { env: params.env } as any,
    bindingName: params.bindingName,
    user: { identifier: params.ownerId },
    resolved: params.resolved,
    input,
    autoApproveHumanReview: params.autoApproveHumanReview ?? true,
    runnerDoIdString: params.ownerId,
    requestMeta: { userAgent: 'trigger:form' },
    entryNodeIds: [params.node.id],
    runContextOverride: output,
  });
}

export async function broadcastFormSubmissionResult(
  env: Env,
  bindingName: string,
  ownerId: string,
  event: {
    workflowId: number;
    nodeId: string;
    formPath: string;
    executionKey: string;
    status: string;
    fields: Record<string, unknown>;
    formUrl: string;
    executionMode: 'test' | 'production';
  },
): Promise<void> {
  const output = buildFormSubmissionOutput(event.fields, {
    formUrl: event.formUrl,
    executionMode: event.executionMode,
  });
  await broadcastWorkflowWebhookResult(env, bindingName, ownerId, {
    workflowId: event.workflowId,
    nodeId: event.nodeId,
    webhookPath: event.formPath,
    executionKey: event.executionKey,
    status: event.status,
    input: JSON.stringify(event.fields),
    output,
    receivedAt: Date.now(),
    method: 'POST',
  });
}
