import { mainFlowNode } from "./common";
import { SQL_HTTP_BODY } from "@aiagents-hub/workflow-nodes";

/** Replaced at render time with the workflow owner Durable Object id (X-Client-ID). */
export const HTTP_REQUEST_CLIENT_ID_HINT = "[1]";

/** Cloudflare DO idFromName().toString() — 64 hex chars. */
const DO_CLIENT_ID_RE = /^[0-9a-fA-F]{64}$/;

export const HTTP_REQUEST_URL_PLACEHOLDER = "https://api.aiagents-hub.vn/hooks/echo";

export const HTTP_REQUEST_HEADERS_PLACEHOLDER = `{
  "Content-Type": "application/json",
  "X-Client-ID": "${HTTP_REQUEST_CLIENT_ID_HINT}",
  "Authorization": "Bearer [input your token]"
}`;

export function isWorkflowClientId(value: string | undefined): value is string {
  return typeof value === "string" && DO_CLIENT_ID_RE.test(value);
}

export function resolveHttpRequestPlaceholder(
  placeholder: string | undefined,
  clientId: string | undefined,
): string | undefined {
  if (!placeholder) return undefined;
  if (!isWorkflowClientId(clientId)) return placeholder;
  return placeholder.replaceAll(HTTP_REQUEST_CLIENT_ID_HINT, clientId);
}

export const HTTP_REQUEST_N8N_DESCRIPTION = mainFlowNode({
  displayName: "HTTP Request",
  name: "http_request",
  icon: "fa:globe",
  group: ["transform"],
  description: "Makes an HTTP request and returns the response.",
  properties: [
    {
      displayName: "Method",
      name: "method",
      type: "options",
      default: "POST",
      options: [
        { name: "GET", value: "GET" },
        { name: "POST", value: "POST" },
        { name: "PUT", value: "PUT" },
        { name: "DELETE", value: "DELETE" },
        { name: "PATCH", value: "PATCH" },
      ],
    },
    {
      displayName: "URL",
      name: "url",
      type: "string",
      default: "",
      required: true,
      placeholder: HTTP_REQUEST_URL_PLACEHOLDER,
      typeOptions: { autofillPlaceholder: true },
    },
    {
      displayName: "JSON Response",
      name: "jsonResponse",
      type: "boolean",
      default: true,
      description: "Parse response body as JSON when possible",
    },
    {
      displayName: "Body",
      name: "body",
      type: "json",
      default: SQL_HTTP_BODY,
      placeholder: '{"sql":"{{ $json.sql }}"}',
      description: "Drag fields from INPUT (Agent). Example: sql → {\"sql\":\"{{ $json.sql }}\"}",
      displayOptions: {
        show: { method: ["POST", "PUT", "PATCH", "DELETE"] },
      },
    },
    {
      displayName: "Headers",
      name: "headers",
      type: "json",
      default: "",
      placeholder: HTTP_REQUEST_HEADERS_PLACEHOLDER,
      typeOptions: { rows: 6, autofillPlaceholder: true },
    },
    {
      displayName: "Credential",
      name: "credentialKey",
      type: "string",
      default: "",
      description: "Workflow credential key for auth",
    },
    {
      displayName: "Fail on error",
      name: "failOnError",
      type: "boolean",
      default: true,
    },
    {
      displayName: "Timeout (ms)",
      name: "timeoutMs",
      type: "number",
      default: 15000,
    },
  ],
});
