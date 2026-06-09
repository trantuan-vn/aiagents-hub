import { mainFlowNode } from "./common";

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
      default: "GET",
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
      placeholder: "https://api.example.com/data",
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
      default: "",
      displayOptions: {
        show: { method: ["POST", "PUT", "PATCH", "DELETE"] },
      },
    },
    {
      displayName: "Headers",
      name: "headers",
      type: "json",
      default: {},
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
