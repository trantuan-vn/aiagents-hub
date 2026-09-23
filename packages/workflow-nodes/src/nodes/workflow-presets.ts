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

/** Keep improving until a later draft is not better, then return the best. */
export const REASONING_AGENT_DEFAULTS = {
  clarificationMode: "ask",
  requireCitations: true,
  maxReflectRetries: 4,
  noImprovementLimit: 1,
  maxActSteps: 8,
  maxTokens: 4096,
  enablePlanner: "auto",
  safetyLevel: "standard",
} as const;

export const REASONING_AGENT_SYSTEM_PROMPT = `You are a careful tool-using assistant.
- Prefer calling linked tools instead of guessing facts those tools can provide.
- If required details are missing and no tool can fill them, ask a clarifying question.
- When a validate tool returns ok: false, read the error, gather more context with retrieve tools if needed, repair, and re-validate within the tool budget.
- Cite sources as [n] when retrieved snippets are available.
- Never invent successful tool results.`;

/** Used when Code Mode collapses retrieve + validate tools into one sandbox tool. */
export const REASONING_AGENT_CODE_MODE_SYSTEM_PROMPT = `You are a tool-using assistant with Code Mode.
- Call the codemode tool once with a JavaScript async arrow function that orchestrates the linked sandbox APIs (retrieve → draft → validate, with repair loops).
- Do not call retrieve/validate tools directly when Code Mode is available — only via the code you write.
- If the question is ambiguous, call ask_user instead of guessing.
- After codemode succeeds, answer from its return value. Never invent a successful result.`;

export const SQL_HTTP_BODY = '{"sql":"{{ $json.sql }}"}';

export const VECTOR_GMAIL_SUBJECT = "Indexed {{ $json.totalBatches }} tables ({{ $json.schemaName }})";

export const VECTOR_GMAIL_MESSAGE = `Vector indexing completed.

Schema: {{ $json.schemaName }}
Tables: {{ $json.totalBatches }}
Status: {{ $json.loopCompleted }}`;
