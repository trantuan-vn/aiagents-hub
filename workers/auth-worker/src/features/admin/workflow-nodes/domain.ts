import { z } from 'zod';

export const WorkflowNodeFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'select',
  'toggle',
  'number',
  'json',
  'expression',
  'info',
  'options-group',
  'resource-link',
]);

export const WorkflowNodeFieldOptionSchema = z.object({
  value: z.string(),
  labelKey: z.string(),
});

export const WorkflowNodeFieldDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  type: WorkflowNodeFieldTypeSchema,
  labelKey: z.string().min(1).max(120),
  descriptionKey: z.string().max(200).optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  placeholderKey: z.string().max(200).optional(),
  options: z.array(WorkflowNodeFieldOptionSchema).optional(),
  supportsExpression: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const WorkflowNodeSectionDefinitionSchema = z.object({
  id: z.enum(['input', 'parameters', 'output']),
  labelKey: z.string().min(1).max(120),
  descriptionKey: z.string().max(200).optional(),
  viewModes: z.array(z.enum(['schema', 'table', 'json'])).optional(),
  fields: z.array(WorkflowNodeFieldDefinitionSchema),
  showExecuteStep: z.boolean().optional(),
});

export const WorkflowNodeCategorySchema = z.enum([
  'trigger',
  'core',
  'ai',
  'action',
  'human',
  'resource',
  'utility',
]);

export const WorkflowNodeDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  runtimeType: z.string().min(1).max(40),
  kind: z.string().max(40).optional(),
  nameKey: z.string().min(1).max(120),
  descriptionKey: z.string().min(1).max(200),
  category: WorkflowNodeCategorySchema,
  icon: z.string().max(40).optional(),
  isBuiltin: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sections: z.array(WorkflowNodeSectionDefinitionSchema).min(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const WorkflowNodeRegistrySchema = z.object({
  nodes: z.array(WorkflowNodeDefinitionSchema),
  updatedAt: z.string().optional(),
});

export const CreateWorkflowNodeSchema = WorkflowNodeDefinitionSchema.omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  isBuiltin: z.boolean().optional(),
});

export const UpdateWorkflowNodeSchema = WorkflowNodeDefinitionSchema.partial().omit({
  id: true,
  isBuiltin: true,
  createdAt: true,
});

export type WorkflowNodeDefinition = z.infer<typeof WorkflowNodeDefinitionSchema>;
export type WorkflowNodeRegistry = z.infer<typeof WorkflowNodeRegistrySchema>;

export const KV_KEY = 'aiagents-hub-workflow-node-registry';
