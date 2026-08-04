/** @deprecated Import from individual node modules or `./index` instead. */
export { TriggerNode } from "./trigger/canvas";
export { AgentWorkflowNode } from "./agent/canvas";
export { ServiceWorkflowNode } from "./service/canvas";
export { MemoryWorkflowNode } from "./memory/canvas";
export { ToolWorkflowNode } from "./tool/canvas";
export { HumanReviewNode } from "./human-review/canvas";
export { FlowNode } from "./flow/canvas";
export { CoreNode } from "./core/canvas";
export { ActionNode } from "./action-in-app/canvas";
export { TransformNode } from "./data-transformation/canvas";
export { StickyNoteNode } from "./sticky-note/canvas";
export { WorkflowGroupNode } from "./workflow-group/canvas";

import { TriggerNode } from "./trigger/canvas";
import { AgentWorkflowNode } from "./agent/canvas";
import { ServiceWorkflowNode } from "./service/canvas";
import { MemoryWorkflowNode } from "./memory/canvas";
import { ToolWorkflowNode } from "./tool/canvas";
import { HumanReviewNode } from "./human-review/canvas";
import { FlowNode } from "./flow/canvas";
import { CoreNode } from "./core/canvas";
import { ActionNode } from "./action-in-app/canvas";
import { TransformNode } from "./data-transformation/canvas";
import { StickyNoteNode } from "./sticky-note/canvas";
import { WorkflowGroupNode } from "./workflow-group/canvas";

/** @deprecated Prefer assembling from BUILTIN_UI_PLUGINS in `./index`. */
export const workflowNodeTypes = {
  workflow_group: WorkflowGroupNode,
  agent: AgentWorkflowNode,
  service_node: ServiceWorkflowNode,
  memory_node: MemoryWorkflowNode,
  tool_node: ToolWorkflowNode,
  trigger: TriggerNode,
  human_review: HumanReviewNode,
  flow: FlowNode,
  core: CoreNode,
  action_in_app: ActionNode,
  data_transformation: TransformNode,
  sticky_note: StickyNoteNode,
};
