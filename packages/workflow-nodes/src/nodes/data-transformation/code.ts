import {
  defaultInputSection,
  defaultOutputSection,
  defaultParametersSection,
} from "../default-sections";
import { createBuiltin } from "../create-builtin";
import type { WorkflowNodeDefinition } from "../../types/node-definition";
import { TRANSFORM_KIND_FIELD } from "./kinds";

/** n8n "Run Once for All Items". */
export const CODE_JS_MODE_ALL = "runOnceForAllItems" as const;
/** n8n "Run Once for Each Item". */
export const CODE_JS_MODE_EACH = "runOnceForEachItem" as const;

export type CodeJsMode = typeof CODE_JS_MODE_ALL | typeof CODE_JS_MODE_EACH;

export const CODE_JS_LANGUAGE = "javascript" as const;

export const CODE_JS_ALL_ITEMS_SOURCE = `// Loop over input items and add a new field called 'myNewField' to the JSON of each one
for (const item of $input.all()) {
  item.json.myNewField = 1;
}

return $input.all();
`;

export const CODE_JS_EACH_ITEM_SOURCE = `// Add a new field called 'myNewField' to the JSON of the item
$input.item.json.myNewField = 1;

return $input.item;
`;

export function codeJsSourceForMode(mode: string): string {
  return mode === CODE_JS_MODE_EACH ? CODE_JS_EACH_ITEM_SOURCE : CODE_JS_ALL_ITEMS_SOURCE;
}

export function isCodeJsStarter(code: string): boolean {
  const trimmed = code.trim();
  return (
    trimmed.length === 0 ||
    trimmed === CODE_JS_ALL_ITEMS_SOURCE.trim() ||
    trimmed === CODE_JS_EACH_ITEM_SOURCE.trim()
  );
}

export function defaultCodeNodeData(): Record<string, unknown> {
  return {
    [TRANSFORM_KIND_FIELD]: "code",
    label: "Code in JavaScript",
    mode: CODE_JS_MODE_ALL,
    language: CODE_JS_LANGUAGE,
    jsCode: CODE_JS_ALL_ITEMS_SOURCE,
    continueOnFail: false,
    notes: "",
  };
}

/** Override — JavaScript Code node for flexible item transforms. */
export const TRANSFORM_CODE_DEFINITION: WorkflowNodeDefinition = createBuiltin({
  id: "data_transformation:code",
  runtimeType: "data_transformation",
  kind: "code",
  nameKey: "transform_kind_code",
  descriptionKey: "transform_kind_code_desc",
  category: "action",
  icon: "Braces",
  defaultData: defaultCodeNodeData(),
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "mode",
        type: "select",
        labelKey: "field_code_mode",
        defaultValue: CODE_JS_MODE_ALL,
        options: [
          { value: CODE_JS_MODE_ALL, labelKey: "opt_code_mode_all" },
          { value: CODE_JS_MODE_EACH, labelKey: "opt_code_mode_each" },
        ],
        order: 1,
      },
      {
        id: "language",
        type: "select",
        labelKey: "field_code_language",
        defaultValue: CODE_JS_LANGUAGE,
        options: [{ value: CODE_JS_LANGUAGE, labelKey: "opt_code_language_javascript" }],
        order: 2,
      },
      {
        id: "jsCode",
        type: "textarea",
        labelKey: "field_code_javascript",
        defaultValue: CODE_JS_ALL_ITEMS_SOURCE,
        order: 3,
      },
    ]),
    defaultOutputSection(true),
  ],
});
