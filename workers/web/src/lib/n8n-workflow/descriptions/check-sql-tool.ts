import { resourceNode } from "./common";

/** Check SQL — run a SELECT on Oracle and return errors for the agent to fix. */
export const CHECK_SQL_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Check SQL",
  name: "tool_node_check_sql",
  icon: "fa:check",
  group: ["transform"],
  description: "Run a SELECT on Oracle and return parser/execution errors if wrong.",
  properties: [
    {
      displayName: "Max sample rows",
      name: "maxRows",
      type: "number",
      default: 5,
      description: "Max rows returned as a sample when the SELECT succeeds (capped server-side).",
    },
    {
      displayName: "Tool name",
      name: "toolName",
      type: "string",
      default: "check_sql",
    },
    {
      displayName: "Description",
      name: "toolDescription",
      type: "string",
      typeOptions: { rows: 3 },
      default:
        "Run a SELECT on Oracle and return parser/execution errors if wrong. Call after get_rag, before treating SQL as the final answer.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Check SQL",
    },
  ],
});
