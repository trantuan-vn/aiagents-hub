/** Recommended expression defaults. Alternate predecessors use || (JS first-truthy). */

export const SIMPLE_MEMORY_SESSION_KEY = "{{ $json.sessionId }}";
export const SIMPLE_MEMORY_CONTEXT_WINDOW = 5;

export const GET_RAG_QUERY_FIELD = "{{ $json.chatInput || $json.body.question || $json.body.message || $json.query || $json.question }}";

/** Metadata key Save RAG stored to keep related docs together (schema + data). */
export const GET_RAG_GROUP_BY_FIELD = "tableName";

export const GET_DB_INFO_USER_FIELD = "{{ $json.u || $json.fields.u || $json.user }}";
export const GET_DB_INFO_PASSWORD_FIELD = "{{ $json.p || $json.fields.p || $json.password }}";
export const GET_DB_INFO_CONNECT_STRING_FIELD = "{{ $json.c || $json.fields.c || $json.connectString }}";
/** Form shorthand `s` = schema/owner (same pattern as u/p/c). */
export const GET_DB_INFO_SCHEMA_FIELD =
  "{{ $json.s || $json.fields.s || $json.schemaName || $json.schema }}";

export const LOOP_ITEMS_FIELD = "{{ $json.items }}";

export const SQL_AGENT_PROMPT = `Question: {{ $json.query }}

Retrieved schema and SQL examples:
{{ $json.ragText }}`;

export const SQL_AGENT_SYSTEM_PROMPT =
  "You are a Text-to-SQL assistant. Use only tables and columns from the retrieved context. Reply with one read-only SQL query in a fenced sql code block.";

export const REASONING_AGENT_PROMPT = `{{ $json.chatInput || $json.body.question || $json.body.message || $json.query || $json.input }}`;

/**
 * Text-to-SQL: `maxReflectRetries` is how many times a statement that failed
 * on the database may be repaired from the engine error (0–5).
 * Generic tools: `maxActSteps` bounds tool calls in the single act turn.
 */
export const REASONING_AGENT_DEFAULTS = {
  clarificationMode: "ask",
  requireCitations: true,
  maxReflectRetries: 2,
  maxActSteps: 8,
  maxTokens: 4096,
  safetyLevel: "standard",
  traceCodeMode: false,
} as const;

export const REASONING_AGENT_SYSTEM_PROMPT = `You are a careful assistant.
- Ground every answer in the retrieved context and tool results. Never invent identifiers or facts.
- If required details are missing and cannot be inferred, ask one short clarifying question.
- Answer in the user's language.`;

export const SQL_HTTP_BODY = '{"sql":"{{ $json.sql }}"}';

export const VECTOR_GMAIL_SUBJECT = "Indexed {{ $json.totalBatches }} tables ({{ $json.schemaName }})";

export const VECTOR_GMAIL_MESSAGE = `Vector indexing completed.

Schema: {{ $json.schemaName }}
Tables: {{ $json.totalBatches }}
Status: {{ $json.loopCompleted }}`;
