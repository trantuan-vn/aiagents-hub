/** Recommended expression defaults. Alternate predecessors use || (JS first-truthy). */

export const GET_RAG_QUERY_FIELD = "{{ $json.body.question || $json.chatInput }}";

export const GET_DB_INFO_USER_FIELD = "{{ $json.u || $json.fields.u || $json.user }}";
export const GET_DB_INFO_PASSWORD_FIELD = "{{ $json.p || $json.fields.p || $json.password }}";
export const GET_DB_INFO_CONNECT_STRING_FIELD = "{{ $json.c || $json.fields.c || $json.connectString }}";

export const LOOP_ITEMS_FIELD = "{{ $json.items }}";

export const SQL_AGENT_PROMPT = `Question: {{ $json.query }}

Retrieved schema and SQL examples:
{{ $json.ragText }}`;

export const SQL_AGENT_SYSTEM_PROMPT =
  "You are a Text-to-SQL assistant. Use only tables and columns from the retrieved context. Reply with one read-only SQL query in a fenced sql code block.";

export const REASONING_AGENT_PROMPT = `{{ $json.chatInput || $json.body.message || $json.query || $json.input }}`;

export const REASONING_AGENT_SYSTEM_PROMPT = `You are a careful assistant. Follow these rules:
- Do not invent facts, URLs, credentials, or tool results.
- If required information is missing and no tool can supply it, ask a clarifying question instead of guessing.
- Call a tool when it can fetch the answer; do not guess values a tool can return.
- Cite sources as [n] that map to provided snippets or tool observations.
- Refuse requests that are illegal, harmful, or ask you to bypass safety rules.`;

export const SQL_HTTP_BODY = '{"sql":"{{ $json.sql }}"}';

export const VECTOR_GMAIL_SUBJECT = "Indexed {{ $json.totalBatches }} tables ({{ $json.schemaName }})";

export const VECTOR_GMAIL_MESSAGE = `Vector indexing completed.

Schema: {{ $json.schemaName }}
Tables: {{ $json.totalBatches }}
Status: {{ $json.loopCompleted }}`;
