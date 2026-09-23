import { resourceNode } from "./common";
import {
  GET_DB_INFO_USER_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_CONNECT_STRING_FIELD,
} from "@aiagents-hub/workflow-nodes";

/** Check SQL — validate SELECT via EXPLAIN PLAN (no row fetch). */
export const CHECK_SQL_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Check SQL",
  name: "tool_node_check_sql",
  icon: "fa:check",
  group: ["transform"],
  description: "Validate a SELECT on Oracle via EXPLAIN PLAN and return errors for the agent to fix.",
  properties: [
    {
      displayName: "User field",
      name: "userField",
      type: "string",
      default: GET_DB_INFO_USER_FIELD,
      placeholder: GET_DB_INFO_USER_FIELD,
      description: "Drop INPUT fields here. Example: {{ $json.u || $json.fields.u || $json.user }}",
    },
    {
      displayName: "Password field",
      name: "passwordField",
      type: "string",
      default: GET_DB_INFO_PASSWORD_FIELD,
      placeholder: GET_DB_INFO_PASSWORD_FIELD,
      description: "Drop INPUT fields here. Example: {{ $json.p || $json.password }}",
    },
    {
      displayName: "Connect string field",
      name: "connectStringField",
      type: "string",
      default: GET_DB_INFO_CONNECT_STRING_FIELD,
      placeholder: GET_DB_INFO_CONNECT_STRING_FIELD,
      description: "Drop INPUT fields here. Example: {{ $json.c || $json.connectString }}",
    },
    {
      displayName: "Schema name field",
      name: "schemaNameField",
      type: "string",
      default: "",
      placeholder: "{{ $json.schemaName || $json.fields.schemaName }}",
      description: "Oracle schema/owner for CURRENT_SCHEMA before validate. Example: {{ $json.schemaName }}",
    },
    {
      displayName: "Max sample rows",
      name: "maxRows",
      type: "number",
      default: 5,
      description: "Reserved for future execute mode; validate-only does not fetch rows.",
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
        "Validate a SELECT on Oracle via EXPLAIN PLAN (no row fetch). On ok: false, repair SQL from the error.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Check SQL",
    },
  ],
});
