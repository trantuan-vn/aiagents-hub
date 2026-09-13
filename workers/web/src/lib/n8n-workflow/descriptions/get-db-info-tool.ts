import { resourceNode } from "./common";
import {
  GET_DB_INFO_USER_FIELD,
  GET_DB_INFO_PASSWORD_FIELD,
  GET_DB_INFO_CONNECT_STRING_FIELD,
} from "@aiagents-hub/workflow-nodes";

/** Get DB Info — map Form credentials into Oracle/D1 connection fields. */
export const GET_DB_INFO_TOOL_N8N_DESCRIPTION = resourceNode({
  displayName: "Get DB Info",
  name: "tool_node_get_db_info",
  icon: "fa:table",
  group: ["transform"],
  description: "List database tables using connection fields from the previous node.",
  properties: [
    {
      displayName: "User field",
      name: "userField",
      type: "string",
      default: GET_DB_INFO_USER_FIELD,
      placeholder: GET_DB_INFO_USER_FIELD,
      description: "Drop INPUT fields here. A second drop joins with ||; edit for ??, &&, or ternary. Example: {{ $json.u || $json.fields.u || $json.user }}",
    },
    {
      displayName: "Password field",
      name: "passwordField",
      type: "string",
      default: GET_DB_INFO_PASSWORD_FIELD,
      placeholder: GET_DB_INFO_PASSWORD_FIELD,
      description: "Drop INPUT fields here. A second drop joins with ||. Example: {{ $json.p || $json.password }}",
    },
    {
      displayName: "Connect string field",
      name: "connectStringField",
      type: "string",
      default: GET_DB_INFO_CONNECT_STRING_FIELD,
      placeholder: GET_DB_INFO_CONNECT_STRING_FIELD,
      description: "Drop INPUT fields here. A second drop joins with ||. Example: {{ $json.c || $json.connectString }}",
    },
    {
      displayName: "Schema name field",
      name: "schemaNameField",
      type: "string",
      default: "",
      placeholder: "{{ $json.schemaName }}",
      description: "Optional. Drag schemaName from INPUT, or leave empty to use the Oracle user.",
    },
    {
      displayName: "Table name field",
      name: "tableNameField",
      type: "string",
      default: "",
      placeholder: "{{ $json.tableName }}",
      description: "Optional. Drag a single tableName, or leave empty to list every table.",
    },
    {
      displayName: "Sample row limit",
      name: "sampleRowLimit",
      type: "number",
      default: 10,
      noDataExpression: true,
    },
    {
      displayName: "SQL history limit",
      name: "sqlHistoryLimit",
      type: "number",
      default: 10,
      noDataExpression: true,
    },
    {
      displayName: "Tool name",
      name: "toolName",
      type: "string",
      default: "get_db_info",
    },
    {
      displayName: "Description",
      name: "toolDescription",
      type: "string",
      typeOptions: { rows: 3 },
      default: "List tables in the connected database. The loop + Save RAG node introspects each table.",
    },
    {
      displayName: "Label",
      name: "label",
      type: "string",
      default: "Get DB Info",
    },
  ],
});
