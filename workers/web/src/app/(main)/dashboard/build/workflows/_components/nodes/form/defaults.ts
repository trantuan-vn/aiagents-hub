import type { FormElement } from "../../panels/node-config/form-node-config-panel";

/** Default node.data fields for the form submission trigger. */
export function formTriggerDefaults(nodeId: string): Record<string, unknown> {
  const path = nodeId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || nodeId;
  const elements: FormElement[] = [];
  return {
    label: "On form submission",
    triggerKind: "form",
    formPath: path,
    formAuth: "none",
    formTitle: "",
    formDescription: "",
    formElements: elements,
    formRespondWhen: "form_submitted",
    formResponseMode: "text",
    formResponseText: "",
  };
}
