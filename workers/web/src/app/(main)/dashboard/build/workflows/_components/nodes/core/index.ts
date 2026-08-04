import {
  CORE_KINDS,
  CORE_OVERRIDE_KINDS,
  type CoreKind,
} from "@aiagents-hub/workflow-nodes";

import type { WorkflowNodeUIPlugin } from "../types";
import { CoreNode } from "./canvas";

export { CoreNode } from "./canvas";

/** Base family plugin — hidden from catalog; kind plugins are the add-node entries. */
export const coreUIPlugin: WorkflowNodeUIPlugin = {
  id: "core",
  runtimeType: "core",
  Canvas: CoreNode,
  defaults: () => ({ label: "Core", coreKind: "http_request" }),
  catalog: {
    category: "core",
    labelKey: "node_core",
    descriptionKey: "node_core_desc",
    icon: "Layers",
    visible: false,
  },
};

export function createCoreKindUIPlugin(kind: CoreKind): WorkflowNodeUIPlugin {
  const label = kind.replace(/_/g, " ");
  return {
    id: `core:${kind}`,
    runtimeType: "core",
    kind,
    Canvas: CoreNode,
    defaults: () => ({
      label,
      coreKind: kind,
    }),
    catalog: {
      category: "core",
      labelKey: `core_kind_${kind}`,
      descriptionKey: `core_kind_${kind}_desc`,
      icon: "Layers",
      keywords: [kind, "core"],
    },
  };
}

/** Factory plugins for kinds without dedicated override modules (skips http_request, code, webhook). */
export const CORE_KIND_UI_PLUGINS: WorkflowNodeUIPlugin[] = CORE_KINDS.filter(
  (kind) => !CORE_OVERRIDE_KINDS.has(kind),
).map(createCoreKindUIPlugin);
