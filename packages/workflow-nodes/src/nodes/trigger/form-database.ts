import { defaultInputSection, defaultOutputSection, defaultParametersSection } from "../default-sections";
import type { WorkflowNodeDefinition } from "../../types/node-definition";

const now = () => new Date().toISOString();

function builtin(
  partial: Omit<WorkflowNodeDefinition, "isBuiltin" | "isActive" | "createdAt" | "updatedAt">,
): WorkflowNodeDefinition {
  const ts = now();
  return { ...partial, isBuiltin: true, isActive: true, createdAt: ts, updatedAt: ts };
}

export const FORM_DATABASE_TRIGGER_DEFINITION = builtin({
  id: "trigger:form-database",
  runtimeType: "trigger",
  kind: "form",
  nameKey: "trigger_kind_form_database",
  descriptionKey: "trigger_kind_form_database_desc",
  category: "trigger",
  icon: "Database",
  sections: [
    defaultInputSection(),
    defaultParametersSection([
      {
        id: "triggerKind",
        type: "select",
        labelKey: "field_trigger_kind",
        defaultValue: "form",
        options: [{ value: "form", labelKey: "opt_trigger_form" }],
        order: 0,
      },
      {
        id: "formKind",
        type: "select",
        labelKey: "field_form_kind",
        defaultValue: "database",
        options: [{ value: "database", labelKey: "opt_form_database" }],
        order: 1,
      },
      { id: "credentialKey", type: "text", labelKey: "field_credential_key", order: 2 },
      {
        id: "connectionType",
        type: "select",
        labelKey: "field_connection_type",
        defaultValue: "d1",
        options: [
          { value: "d1", labelKey: "conn_d1" },
          { value: "hyperdrive", labelKey: "conn_hyperdrive" },
          { value: "postgres", labelKey: "conn_postgres" },
          { value: "mysql", labelKey: "conn_mysql" },
        ],
        order: 3,
      },
      { id: "databaseId", type: "text", labelKey: "field_database_id", order: 4 },
      { id: "schemaName", type: "text", labelKey: "field_schema_name", defaultValue: "public", order: 5 },
      {
        id: "executionMode",
        type: "select",
        labelKey: "field_execution_mode",
        defaultValue: "per_table",
        options: [
          { value: "per_table", labelKey: "opt_exec_per_table" },
          { value: "once", labelKey: "opt_exec_once" },
        ],
        order: 6,
      },
      { id: "tableFilter", type: "text", labelKey: "field_table_filter", defaultValue: "*", order: 7 },
      { id: "sampleRowLimit", type: "number", labelKey: "field_sample_row_limit", defaultValue: 10, order: 8 },
      { id: "sqlHistoryLimit", type: "number", labelKey: "field_sql_history_limit", defaultValue: 10, order: 9 },
    ]),
    defaultOutputSection(true),
  ],
  defaultData: {
    triggerKind: "form",
    formKind: "database",
    connectionType: "d1",
    schemaName: "public",
    executionMode: "per_table",
    tableFilter: "*",
    sampleRowLimit: 10,
    sqlHistoryLimit: 10,
  },
});
