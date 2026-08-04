import type { WorkflowNodePlugin } from '../types.js';
import { executeHttpRequest } from './execute.js';

export { executeHttpRequest } from './execute.js';

export const httpRequestPlugin: WorkflowNodePlugin = {
  id: 'http_request',
  runtimeType: 'http_request',
  execute: executeHttpRequest,
};

/** Legacy core + kind alias used by graphs stored as type core / coreKind http_request. */
export const coreHttpRequestPlugin: WorkflowNodePlugin = {
  id: 'core:http_request',
  runtimeType: 'http_request',
  kind: 'http_request',
  execute: executeHttpRequest,
};
