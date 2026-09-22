/** Recommended expression defaults. Alternate predecessors use || (JS first-truthy). */

export const SIMPLE_MEMORY_SESSION_KEY = "{{ $json.sessionId }}";
export const SIMPLE_MEMORY_CONTEXT_WINDOW = 5;

export const GET_RAG_QUERY_FIELD = "{{ $json.chatInput || $json.body.question || $json.body.message || $json.query || $json.question }}";

/** Metadata key Save RAG stored to keep related docs together (schema + data). */
export const GET_RAG_GROUP_BY_FIELD = "tableName";

export const GET_DB_INFO_USER_FIELD = "{{ $json.u || $json.fields.u || $json.user }}";
export const GET_DB_INFO_PASSWORD_FIELD = "{{ $json.p || $json.fields.p || $json.password }}";
export const GET_DB_INFO_CONNECT_STRING_FIELD = "{{ $json.c || $json.fields.c || $json.connectString }}";

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

export const REASONING_AGENT_SYSTEM_PROMPT = `You are a Text-to-SQL assistant.
- Always call get_rag first with the user question (search schema and sqlexample docs).
- Use only tables and columns that appear in retrieved snippets. Never invent names.
- If the question is ambiguous (table, grain, date range, join key missing), ask a clarifying question instead of guessing.
- After drafting a SELECT, call check_sql to verify it on Oracle. Only treat SQL as final when check_sql returns ok: true.
- If check_sql returns ok: false: (1) read the Oracle error, (2) call get_rag again with a focused query (missing table/column, join key, or the error text) to enrich schema/SQL examples, (3) rewrite the SELECT, (4) call check_sql again. Repeat within the tool budget; do not claim success without ok: true.
- Reply with exactly one read-only SQL query in a fenced sql code block. No INSERT/UPDATE/DELETE/DDL.
- Qualify tables as schema.table. Prefer patterns from retrieved SQL examples.
- Cite sources as [n] mapped to retrieved snippets.
- If you cannot get check_sql ok: true, say the statement did not run and include the last Oracle error — never invent a successful result.`;

export const SQL_HTTP_BODY = '{"sql":"{{ $json.sql }}"}';

export const VECTOR_GMAIL_SUBJECT = "Indexed {{ $json.totalBatches }} tables ({{ $json.schemaName }})";

export const VECTOR_GMAIL_MESSAGE = `Vector indexing completed.

Schema: {{ $json.schemaName }}
Tables: {{ $json.totalBatches }}
Status: {{ $json.loopCompleted }}`;
