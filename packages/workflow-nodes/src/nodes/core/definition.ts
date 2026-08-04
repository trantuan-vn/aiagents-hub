import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

export const CORE_NODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "core",
  runtimeType: "core",
  nameKey: "node_core",
  descriptionKey: "node_core_desc",
  category: "core",
  icon: "Layers",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "coreKind",
        type: "select",
        labelKey: "field_core_kind",
        defaultValue: "http_request",
        options: [
          { value: "http_request", labelKey: "opt_core_http" },
          { value: "code", labelKey: "opt_core_code" },
          { value: "webhook", labelKey: "opt_core_webhook" },
        ],
        order: 1,
      },
    ]),
    defaultOutputSection(true),
  ],
});

export const CORE_HTTP_REQUEST_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "core:http_request",
  runtimeType: "http_request",
  kind: "http_request",
  nameKey: "core_kind_http_request",
  descriptionKey: "core_kind_http_request_desc",
  category: "core",
  icon: "Globe",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "method",
        type: "select",
        labelKey: "field_http_method",
        defaultValue: "GET",
        options: [
          { value: "GET", labelKey: "opt_http_get" },
          { value: "POST", labelKey: "opt_http_post" },
          { value: "PUT", labelKey: "opt_http_put" },
          { value: "DELETE", labelKey: "opt_http_delete" },
        ],
        order: 1,
      },
      {
        id: "url",
        type: "expression",
        labelKey: "field_http_url",
        supportsExpression: true,
        required: true,
        order: 2,
      },
      {
        id: "body",
        type: "json",
        labelKey: "field_http_body",
        supportsExpression: true,
        order: 3,
      },
    ]),
    defaultOutputSection(true),
  ],
});

export const CORE_CODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "core:code",
  runtimeType: "code",
  kind: "code",
  nameKey: "core_kind_code",
  descriptionKey: "core_kind_code_desc",
  category: "core",
  icon: "Braces",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "language",
        type: "select",
        labelKey: "field_code_language",
        defaultValue: "javascript",
        options: [
          { value: "javascript", labelKey: "opt_lang_javascript" },
          { value: "python", labelKey: "opt_lang_python" },
        ],
        order: 1,
      },
      {
        id: "code",
        type: "textarea",
        labelKey: "field_code",
        supportsExpression: true,
        order: 2,
      },
    ]),
    defaultOutputSection(true),
  ],
});
