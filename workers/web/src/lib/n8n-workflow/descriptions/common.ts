import type { N8nNodeTypeDescription } from "../types";

type NodeDescPartial = Pick<
  N8nNodeTypeDescription,
  "displayName" | "name" | "description" | "group" | "properties"
> & {
  icon?: string;
};

export function mainFlowNode(partial: NodeDescPartial): N8nNodeTypeDescription {
  return {
    version: 1,
    defaults: { name: partial.displayName },
    inputs: ["main"],
    outputs: ["main"],
    ...partial,
  };
}

export function resourceNode(partial: NodeDescPartial): N8nNodeTypeDescription {
  return {
    version: 1,
    defaults: { name: partial.displayName },
    inputs: [],
    outputs: ["main"],
    ...partial,
  };
}
