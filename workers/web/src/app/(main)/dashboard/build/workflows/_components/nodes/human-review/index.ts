import type { WorkflowNodeUIPlugin } from "../types";
import { HumanReviewNode } from "./canvas";

export { HumanReviewNode } from "./canvas";

export const humanReviewUIPlugin: WorkflowNodeUIPlugin = {
  id: "human_review",
  runtimeType: "human_review",
  Canvas: HumanReviewNode,
  defaults: () => ({ label: "Human review" }),
  catalog: {
    category: "human",
    labelKey: "node_human_review",
    descriptionKey: "node_human_review_desc",
    icon: "UserCheck",
  },
};
