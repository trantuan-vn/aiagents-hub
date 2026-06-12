import type { WorkflowNodeSectionDefinition } from "../types/node-definition";

/** Minimal IO sections used as defaults for nodes without custom admin design. */
export function defaultInputSection(): WorkflowNodeSectionDefinition {
  return {
    id: "input",
    labelKey: "section_input",
    descriptionKey: "section_input_desc",
    viewModes: ["schema", "table", "json"],
    fields: [
      {
        id: "upstream",
        type: "info",
        labelKey: "field_upstream",
        descriptionKey: "field_upstream_desc",
        order: 0,
      },
      {
        id: "context",
        type: "json",
        labelKey: "field_context",
        descriptionKey: "field_context_desc",
        supportsExpression: true,
        order: 1,
      },
    ],
  };
}

export function defaultOutputSection(showExecute = true): WorkflowNodeSectionDefinition {
  return {
    id: "output",
    labelKey: "section_output",
    descriptionKey: "section_output_desc",
    viewModes: ["schema", "table", "json"],
    showExecuteStep: showExecute,
    fields: [
      {
        id: "mockData",
        type: "json",
        labelKey: "field_mock_output",
        descriptionKey: "field_mock_output_desc",
        order: 0,
      },
    ],
  };
}

export function defaultParametersSection(
  fields: WorkflowNodeSectionDefinition["fields"] = [],
): WorkflowNodeSectionDefinition {
  return {
    id: "parameters",
    labelKey: "section_parameters",
    descriptionKey: "section_parameters_desc",
    fields: [
      {
        id: "label",
        type: "text",
        labelKey: "field_label",
        required: true,
        order: 0,
      },
      ...fields,
    ],
  };
}
