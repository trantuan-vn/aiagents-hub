/** n8n-compatible webhook item — downstream nodes receive this shape as input. */
export type WebhookFileOutput = {
  filename: string;
  mimeType: string;
  data: string;
};

export type WebhookItemOutput = {
  headers: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  files?: WebhookFileOutput[];
  webhookUrl: string;
  executionMode: "test" | "production";
  /** Copied from body.question (and aliases) for `$json.chatInput`. */
  chatInput?: string;
};

export type BuildWebhookItemParams = {
  webhookUrl: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  params?: Record<string, string>;
  body?: unknown;
  files?: WebhookFileOutput[];
  executionMode?: "test" | "production";
};

const WEBHOOK_ITEM_KEYS = ["headers", "params", "query", "body", "webhookUrl", "executionMode"] as const;

const WEBHOOK_QUESTION_KEYS = ["question", "message", "query", "text", "chatInput", "input"] as const;

/** Read the user question from webhook JSON aliases (`question`, `message`, …). */
export function resolveWebhookQuestion(body: unknown): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const rec = body as Record<string, unknown>;
  for (const key of WEBHOOK_QUESTION_KEYS) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Ensure `$json.body.question` is set so Get RAG / Agent can read the payload. */
export function normalizeWebhookIngressBody(body: unknown): unknown {
  const question = resolveWebhookQuestion(body);
  if (!question) return body ?? {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return { question };
  const rec = { ...(body as Record<string, unknown>) };
  if (typeof rec.question !== "string" || !String(rec.question).trim()) rec.question = question;
  return rec;
}

export function buildWebhookItemOutput(params: BuildWebhookItemParams): WebhookItemOutput {
  const body = normalizeWebhookIngressBody(params.body);
  const question = resolveWebhookQuestion(body);
  return {
    headers: params.headers ?? {},
    params: params.params ?? {},
    query: params.query ?? {},
    body,
    ...(params.files?.length ? { files: params.files } : {}),
    webhookUrl: params.webhookUrl,
    executionMode: params.executionMode ?? "test",
    ...(question ? { chatInput: question } : {}),
  };
}

export function normalizeWebhookItemOutput(raw: unknown, fallbackUrl?: string): WebhookItemOutput | null {
  if (raw == null) return null;

  let value = raw;
  if (Array.isArray(value)) {
    value = value[0];
  }

  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  if (WEBHOOK_ITEM_KEYS.every((k) => k in obj)) {
    return buildWebhookItemOutput({
      headers: asStringRecord(obj.headers),
      params: asStringRecord(obj.params),
      query: asStringRecord(obj.query),
      body: obj.body ?? {},
      webhookUrl: String(obj.webhookUrl ?? fallbackUrl ?? ""),
      executionMode: obj.executionMode === "production" ? "production" : "test",
    });
  }

  if ("body" in obj || "method" in obj) {
    return buildWebhookItemOutput({
      webhookUrl: fallbackUrl ?? "",
      headers: typeof obj.method === "string" ? { "x-http-method": obj.method } : {},
      body: obj.body ?? {},
      executionMode: "test",
    });
  }

  return null;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

export type SchemaTreeRow = {
  path: string;
  name: string;
  type: string;
  depth: number;
  value?: unknown;
  hasChildren: boolean;
};

export function inferJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function buildSchemaTreeRows(data: Record<string, unknown>, maxDepth = 6): SchemaTreeRow[] {
  const rows: SchemaTreeRow[] = [];

  function walk(value: unknown, path: string, name: string, depth: number) {
    if (depth > maxDepth) return;
    const type = inferJsonType(value);
    const isObject = type === "object" && value !== null && !Array.isArray(value);
    const isArray = Array.isArray(value);

    rows.push({
      path,
      name,
      type: isArray ? "array" : type,
      depth,
      value: isObject || isArray ? undefined : value,
      hasChildren: isObject || isArray,
    });

    if (isObject) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, path ? `${path}.${key}` : key, key, depth + 1);
      }
    } else if (isArray && value.length > 0) {
      walk(value[0], `${path}[0]`, "[0]", depth + 1);
    }
  }

  for (const [key, value] of Object.entries(data)) {
    walk(value, key, key, 0);
  }

  return rows;
}

export type TableRow = { path: string; value: string };

export function flattenWebhookItemForTable(item: WebhookItemOutput): TableRow[] {
  const rows: TableRow[] = [];

  function walk(value: unknown, prefix: string) {
    const type = inferJsonType(value);
    if (type === "object" && value !== null && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length) {
        rows.push({ path: prefix, value: "{}" });
        return;
      }
      for (const [k, v] of entries) {
        walk(v, prefix ? `${prefix}.${k}` : k);
      }
      return;
    }
    if (Array.isArray(value)) {
      rows.push({ path: prefix, value: JSON.stringify(value) });
      return;
    }
    rows.push({
      path: prefix,
      value: value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value),
    });
  }

  for (const [key, value] of Object.entries(item)) {
    walk(value, key);
  }

  return rows;
}

/** Parse incoming HTTP request into trigger input + n8n webhook item params. */
export async function parseWebhookRequest(
  request: Request,
  trigger: { input: string | null },
  options: {
    executionMode: "test" | "production";
    binaryField?: string;
  },
): Promise<{ input: string; itemParams: BuildWebhookItemParams }> {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let input = query.input ?? "";
  let body: unknown = {};
  let files: WebhookFileOutput[] | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  const binaryField = options.binaryField ?? "data";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (form) {
      const formBody: Record<string, unknown> = {};
      files = [];
      const fileTasks: Promise<void>[] = [];
      form.forEach((value, key) => {
        if (value instanceof File) {
          fileTasks.push(
            (async () => {
              const buffer = await value.arrayBuffer();
              const base64 = arrayBufferToBase64(buffer);
              const fileEntry: WebhookFileOutput = {
                filename: value.name || key,
                mimeType: value.type || "application/octet-stream",
                data: base64,
              };
              files!.push(fileEntry);
              if (key === binaryField || !formBody[binaryField]) {
                formBody[binaryField] = files;
              }
            })(),
          );
        } else {
          formBody[key] = String(value);
        }
      });
      await Promise.all(fileTasks);
      body = formBody;
      if (!input) input = JSON.stringify(formBody);
    }
  } else {
    const raw = await request.text().catch(() => "");

    if (!input && raw) {
      input = raw;
    }

    if (raw) {
      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      } else if (raw.trim()) {
        body = raw;
      }
    } else if (input) {
      try {
        body = JSON.parse(input);
      } catch {
        body = input;
      }
    }
  }

  if (!input) {
    input = trigger.input ?? "";
  }

  const fromQuery: Record<string, unknown> = {};
  for (const key of WEBHOOK_QUESTION_KEYS) {
    if (query[key]) fromQuery[key] = query[key];
  }
  const mergedBody =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? { ...fromQuery, ...(body as Record<string, unknown>) }
      : Object.keys(fromQuery).length
        ? fromQuery
        : body;
  body = normalizeWebhookIngressBody(mergedBody);

  return {
    input,
    itemParams: {
      webhookUrl: url.toString(),
      method: request.method,
      headers,
      query,
      params: {},
      body,
      ...(files?.length ? { files } : {}),
      executionMode: options.executionMode,
    },
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
