import type { WorkflowNodePlugin } from '../types.js';
import { executeDataTransformation } from './execute.js';

export { executeDataTransformation } from './execute.js';

export const dataTransformationPlugin: WorkflowNodePlugin = {
  id: 'data_transformation',
  runtimeType: 'data_transformation',
  execute: executeDataTransformation,
};
