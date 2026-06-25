import { ClipboardList } from "lucide-react";

import type { WorkflowNodeUIPlugin } from "../types";
import { FormTriggerCanvas } from "./canvas";
import { isFormNode, FormNodeConfigPanel } from "./config-panel";
import { formTriggerDefaults } from "./defaults";

export { formTriggerDefaults } from "./defaults";
export { isFormNode, FormNodeConfigPanel, type FormElement } from "./config-panel";

export const formTriggerUIPlugin: WorkflowNodeUIPlugin = {
  id: "trigger:form",
  runtimeType: "trigger",
  kind: "form",
  Canvas: FormTriggerCanvas,
  ConfigPanel: FormNodeConfigPanel,
  defaults: () => formTriggerDefaults(`trigger-${Date.now()}`),
  catalog: {
    category: "trigger",
    labelKey: "trigger_kind_form",
    descriptionKey: "trigger_kind_form_desc",
    icon: "ClipboardList",
    keywords: ["form", "submission", "trigger"],
  },
  match: (node) => isFormNode(node) && node.type === "trigger",
};

/** Lucide icon for catalog rendering */
export const FormCatalogIcon = ClipboardList;
