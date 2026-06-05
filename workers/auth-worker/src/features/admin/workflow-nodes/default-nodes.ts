import type { WorkflowNodeDefinition, WorkflowNodeRegistry } from './domain';

const now = () => new Date().toISOString();

function defaultInputSection() {
  return {
    id: 'input' as const,
    labelKey: 'section_input',
    descriptionKey: 'section_input_desc',
    viewModes: ['schema', 'table', 'json'] as ('schema' | 'table' | 'json')[],
    fields: [
      { id: 'upstream', type: 'info' as const, labelKey: 'field_upstream', descriptionKey: 'field_upstream_desc', order: 0 },
      { id: 'context', type: 'json' as const, labelKey: 'field_context', descriptionKey: 'field_context_desc', supportsExpression: true, order: 1 },
    ],
  };
}

function defaultOutputSection(showExecute = true) {
  return {
    id: 'output' as const,
    labelKey: 'section_output',
    descriptionKey: 'section_output_desc',
    viewModes: ['schema', 'table', 'json'] as ('schema' | 'table' | 'json')[],
    showExecuteStep: showExecute,
    fields: [
      { id: 'mockData', type: 'json' as const, labelKey: 'field_mock_output', descriptionKey: 'field_mock_output_desc', order: 0 },
    ],
  };
}

function defaultParametersSection(fields: WorkflowNodeDefinition['sections'][0]['fields'] = []) {
  return {
    id: 'parameters' as const,
    labelKey: 'section_parameters',
    descriptionKey: 'section_parameters_desc',
    fields: [{ id: 'label', type: 'text' as const, labelKey: 'field_label', required: true, order: 0 }, ...fields],
  };
}

function builtin(
  partial: Omit<WorkflowNodeDefinition, 'isBuiltin' | 'isActive' | 'createdAt' | 'updatedAt'>,
): WorkflowNodeDefinition {
  const ts = now();
  return { ...partial, isBuiltin: true, isActive: true, createdAt: ts, updatedAt: ts };
}

const AGENT_NODE = builtin({
  id: 'agent',
  runtimeType: 'agent',
  nameKey: 'node_agent',
  descriptionKey: 'node_agent_desc',
  category: 'ai',
  icon: 'Bot',
  sections: [
    {
      ...defaultInputSection(),
      fields: [
        { id: 'workflowTrigger', type: 'info', labelKey: 'field_workflow_trigger', descriptionKey: 'field_workflow_trigger_desc', order: 0 },
        { id: 'variables', type: 'json', labelKey: 'field_variables_context', descriptionKey: 'field_variables_context_desc', supportsExpression: true, order: 1 },
      ],
    },
    {
      id: 'parameters',
      labelKey: 'section_parameters',
      descriptionKey: 'section_parameters_desc',
      fields: [
        { id: 'label', type: 'text', labelKey: 'field_label', required: true, order: 0 },
        { id: 'promptSource', type: 'select', labelKey: 'field_prompt_source', defaultValue: 'define_below', options: [{ value: 'define_below', labelKey: 'opt_prompt_define_below' }, { value: 'from_input', labelKey: 'opt_prompt_from_input' }], order: 1 },
        { id: 'prompt', type: 'textarea', labelKey: 'field_prompt', descriptionKey: 'field_prompt_desc', supportsExpression: true, placeholderKey: 'field_prompt_placeholder', order: 2 },
        { id: 'requireOutputFormat', type: 'toggle', labelKey: 'field_require_output_format', defaultValue: false, order: 3 },
        { id: 'enableFallbackModel', type: 'toggle', labelKey: 'field_enable_fallback_model', defaultValue: false, order: 4 },
        { id: 'options', type: 'options-group', labelKey: 'field_options', descriptionKey: 'field_options_desc', order: 5 },
        { id: 'chatModel', type: 'resource-link', labelKey: 'field_chat_model', descriptionKey: 'field_chat_model_desc', required: true, order: 6 },
        { id: 'memory', type: 'resource-link', labelKey: 'field_memory', descriptionKey: 'field_memory_desc', order: 7 },
        { id: 'tools', type: 'resource-link', labelKey: 'field_tools', descriptionKey: 'field_tools_desc', order: 8 },
      ],
    },
    defaultOutputSection(true),
  ],
});

const SIMPLE_NODES: WorkflowNodeDefinition[] = [
  builtin({ id: 'trigger', runtimeType: 'trigger', nameKey: 'node_trigger', descriptionKey: 'node_trigger_desc', category: 'trigger', icon: 'Play', sections: [defaultInputSection(), defaultParametersSection([{ id: 'triggerKind', type: 'select', labelKey: 'field_trigger_kind', defaultValue: 'manual', options: [{ value: 'manual', labelKey: 'opt_trigger_manual' }, { value: 'webhook', labelKey: 'opt_trigger_webhook' }, { value: 'schedule', labelKey: 'opt_trigger_schedule' }], order: 1 }]), defaultOutputSection(false)] }),
  builtin({ id: 'flow', runtimeType: 'flow', nameKey: 'node_flow', descriptionKey: 'node_flow_desc', category: 'core', icon: 'GitBranch', sections: [defaultInputSection(), defaultParametersSection([{ id: 'flowKind', type: 'select', labelKey: 'field_flow_kind', defaultValue: 'if', options: [{ value: 'if', labelKey: 'opt_flow_if' }, { value: 'merge', labelKey: 'opt_flow_merge' }, { value: 'switch', labelKey: 'opt_flow_switch' }], order: 1 }]), defaultOutputSection(true)] }),
  builtin({ id: 'core', runtimeType: 'core', nameKey: 'node_core', descriptionKey: 'node_core_desc', category: 'core', icon: 'Layers', sections: [defaultInputSection(), defaultParametersSection([{ id: 'coreKind', type: 'select', labelKey: 'field_core_kind', defaultValue: 'http_request', options: [{ value: 'http_request', labelKey: 'opt_core_http' }, { value: 'code', labelKey: 'opt_core_code' }, { value: 'webhook', labelKey: 'opt_core_webhook' }], order: 1 }]), defaultOutputSection(true)] }),
  builtin({ id: 'core:http_request', runtimeType: 'http_request', kind: 'http_request', nameKey: 'core_kind_http_request', descriptionKey: 'core_kind_http_request_desc', category: 'core', icon: 'Globe', sections: [defaultInputSection(), defaultParametersSection([{ id: 'method', type: 'select', labelKey: 'field_http_method', defaultValue: 'GET', options: [{ value: 'GET', labelKey: 'opt_http_get' }, { value: 'POST', labelKey: 'opt_http_post' }, { value: 'PUT', labelKey: 'opt_http_put' }, { value: 'DELETE', labelKey: 'opt_http_delete' }], order: 1 }, { id: 'url', type: 'expression', labelKey: 'field_http_url', supportsExpression: true, required: true, order: 2 }, { id: 'body', type: 'json', labelKey: 'field_http_body', supportsExpression: true, order: 3 }]), defaultOutputSection(true)] }),
  builtin({ id: 'core:code', runtimeType: 'code', kind: 'code', nameKey: 'core_kind_code', descriptionKey: 'core_kind_code_desc', category: 'core', icon: 'Braces', sections: [defaultInputSection(), defaultParametersSection([{ id: 'language', type: 'select', labelKey: 'field_code_language', defaultValue: 'javascript', options: [{ value: 'javascript', labelKey: 'opt_lang_javascript' }, { value: 'python', labelKey: 'opt_lang_python' }], order: 1 }, { id: 'code', type: 'textarea', labelKey: 'field_code', supportsExpression: true, order: 2 }]), defaultOutputSection(true)] }),
  builtin({ id: 'action_in_app', runtimeType: 'action_in_app', nameKey: 'node_action', descriptionKey: 'node_action_desc', category: 'action', icon: 'Zap', sections: [defaultInputSection(), defaultParametersSection([{ id: 'integrationId', type: 'text', labelKey: 'field_integration', order: 1 }, { id: 'actionId', type: 'text', labelKey: 'field_action', order: 2 }]), defaultOutputSection(true)] }),
  builtin({ id: 'data_transformation', runtimeType: 'data_transformation', nameKey: 'node_transform', descriptionKey: 'node_transform_desc', category: 'action', icon: 'Wrench', sections: [defaultInputSection(), defaultParametersSection([{ id: 'mode', type: 'select', labelKey: 'field_transform_mode', defaultValue: 'manual', options: [{ value: 'manual', labelKey: 'opt_transform_manual' }, { value: 'auto', labelKey: 'opt_transform_auto' }], order: 1 }]), defaultOutputSection(true)] }),
  builtin({ id: 'human_review', runtimeType: 'human_review', nameKey: 'node_human_review', descriptionKey: 'node_human_review_desc', category: 'human', icon: 'UserCheck', sections: [defaultInputSection(), defaultParametersSection([{ id: 'channel', type: 'select', labelKey: 'field_review_channel', defaultValue: 'email', options: [{ value: 'email', labelKey: 'opt_review_email' }, { value: 'slack', labelKey: 'opt_review_slack' }], order: 1 }]), defaultOutputSection(true)] }),
  builtin({ id: 'service_node', runtimeType: 'service_node', nameKey: 'node_service', descriptionKey: 'node_service_desc', category: 'resource', icon: 'Server', sections: [defaultInputSection(), defaultParametersSection([{ id: 'catalogId', type: 'text', labelKey: 'field_service_catalog', order: 1 }, { id: 'endpoint', type: 'text', labelKey: 'field_service_endpoint', order: 2 }]), defaultOutputSection(false)] }),
  builtin({ id: 'memory_node', runtimeType: 'memory_node', nameKey: 'node_memory', descriptionKey: 'node_memory_desc', category: 'resource', icon: 'Database', sections: [defaultInputSection(), defaultParametersSection([{ id: 'memoryKind', type: 'select', labelKey: 'field_memory_kind', defaultValue: 'r2', options: [{ value: 'r2', labelKey: 'mem_r2' }, { value: 'd1', labelKey: 'mem_d1' }, { value: 'vectorize', labelKey: 'mem_vectorize' }], order: 1 }]), defaultOutputSection(false)] }),
  builtin({ id: 'tool_node', runtimeType: 'tool_node', nameKey: 'node_tool', descriptionKey: 'node_tool_desc', category: 'resource', icon: 'Wrench', sections: [defaultInputSection(), defaultParametersSection([{ id: 'toolKind', type: 'select', labelKey: 'field_tool_kind', defaultValue: 'http-request', options: [{ value: 'http-request', labelKey: 'tool_http' }, { value: 'code', labelKey: 'tool_code' }], order: 1 }]), defaultOutputSection(false)] }),
];

export const DEFAULT_WORKFLOW_NODE_REGISTRY: WorkflowNodeRegistry = {
  nodes: [AGENT_NODE, ...SIMPLE_NODES],
  updatedAt: now(),
};
