# Node: Reasoning Agent (`agent:reasoning_agent`)

> **Trạng thái:** Done (v2 — pipeline Text-to-SQL do host điều khiển)  
> **Family:** [`agent.md`](./agent.md)  
> **Kind:** `reasoning_agent` — song song `tools_agent`, không thay SQL/tools agent.
>
> **Code Mode:** kind này **không còn dùng Code Mode**. Node `code` nối vào `tools` được bỏ qua; Code Mode vẫn hoạt động với `tools_agent` ([`code.md`](./code.md)).

Hai nhánh, chọn theo tool nối vào handle `tools`:

| Khi nào | Nhánh | LLM làm gì |
|---------|-------|------------|
| Có tool `validate` tên `check_sql` (thường kèm Get RAG) | **Text-to-SQL pipeline** | Chỉ viết SQL. Host tự truy xuất schema, tự chạy Check SQL, tự lấy thêm schema khi Oracle báo thiếu identifier |
| Không có | **Tool chat** | Một lượt `generateText` có tool calling (HTTP tools, Get RAG, memory, `ask_user`) |

Cổng chung cho cả hai nhánh: **safety (rule → LLM review) → memory → nhánh → screen output → lưu memory**.

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `agent:reasoning_agent` |
| **runtimeType** | `agent` |
| **agentKind** | `reasoning_agent` |
| **Vai trò** | Text-to-SQL có kiểm chứng trên Oracle; hỏi lại khi thiếu dữ liệu; nhớ phiên; từ chối yêu cầu nguy hiểm |

`tools_agent` giữ nguyên `executeAgent`. Kind này chạy `executeReasoningAgent`.

## 2. Text-to-SQL pipeline (generate → execute → repair)

Mẫu "execution-guided repair": vòng lặp là code deterministic, model chỉ nhận một việc mỗi lần gọi.

1. **Rewrite (tùy chọn)** — chỉ khi system prompt có từ vựng nghiệp vụ: LLM viết lại câu hỏi để truy xuất schema tốt hơn (`rewrite-question.ts`). Câu hỏi gốc vẫn là câu hỏi gửi cho model.
2. **Retrieve** — host gọi `prefetchLinkedGetRag` (Get RAG đã nối). Model không bao giờ tự gọi `get_rag`.
3. **Generate** — một lệnh LLM: system = prompt người dùng + quy tắc SQL (`SQL_RULES`), user = câu hỏi + schema truy xuất. Model trả **đúng một** `SELECT`/`WITH` trong fence ```` ```sql ````, hoặc `ASK: <câu hỏi>` khi thiếu dữ liệu không suy được.
4. **Execute** — host chạy Check SQL (Oracle `EXPLAIN PLAN`, [`check-sql.md`](./check-sql.md)).
5. **Repair** — nếu lỗi: lượt sau gửi lại SQL cũ + lỗi Oracle nguyên văn. Với `ORA-00904` / `ORA-00942` (identifier/table không tồn tại) host gọi Get RAG với query lấy từ lỗi (`oracleRetrieveQuery`), **gộp** vào schema đã có rồi mới gọi model.
6. **Dừng** — `ok: true` → `status: "ok"`, `validated: true`. Hết `maxReflectRetries` lượt sửa → `ask`: một câu hỏi ngắn bằng ngôn ngữ user (LLM purpose `ask`); `best_effort`: trả SQL cuối với `validated: false`, `reason` = lỗi cuối.

Lỗi cấu hình validator (`Missing Oracle credentials…`) ném lỗi ngay, không lặp, không hỏi lại.

Số lần gọi LLM mỗi lần chạy: `1 + số lượt sửa` (+1 rewrite, +1 ask khi hết lượt, +1 safety khi input bị cờ review).

## 3. Output

```ts
{
  status: "ok" | "needs_clarification" | "refused",
  text: string,              // SQL (pipeline) hoặc câu trả lời (chat)
  sql?: string,
  validated?: boolean,       // true chỉ khi Check SQL ok
  columns?: string[],        // từ Check SQL
  rowCount?: number,
  attempts?: number,         // số lượt generate đã dùng
  citations: [{ id, source, snippet, tool? }],
  questions?: string[],
  confidence: number,
  reason?: string,
  category?: "illegal" | "harmful" | "jailbreak" | "policy",
  query: string,
  snippets: string[],
  count: number,
  endpoint: string,
  trace?: [{ step, ...fields }]   // chỉ khi traceCodeMode = true
}
```

Graph: nếu `status === "needs_clarification"` và node `human_review` nằm downstream, engine pause như hiện tại. Agent **không** tự pause.

## 4. Options (`node.data`)

Giá trị lấy từ panel node (literal hoặc `{{ $json… }}` map từ INPUT). **Chỉ fallback khi field trống / expression không ra giá trị.**

| Key | Fallback nếu trống | Mô tả |
|-----|---------|--------|
| `maxTokens` | `4096` | Ưu tiên ô Max tokens trên agent; trống thì service, rồi 1024. Bị cắt (`finish_reason = length`) thì gọi lại một lần ở mức cao hơn (≥ 8192, tối đa 32768) |
| `clarificationMode` | `ask` | `ask` dừng để hỏi; `best_effort` trả SQL chưa kiểm chứng |
| `requireCitations` | `true` | Nhánh chat: ép `[n]` khi có nguồn |
| `maxReflectRetries` | `2` | Số lượt **sửa SQL theo lỗi database** (0–5) |
| `maxActSteps` | `8` | Nhánh chat: số bước gọi tool trong một lượt (1–12) |
| `safetyLevel` | `standard` | `strict` ẩn tool ghi/xóa |
| `traceCodeMode` | `false` | Ghi `trace` các bước retrieve / generate / validate vào output và log |

Đã bỏ: `enablePlanner`, `noImprovementLimit` (không còn plan/reflect/scoring).

Prompt mặc định: `REASONING_AGENT_SYSTEM_PROMPT` (ngắn, không mô tả vòng tool — quy tắc SQL do host nối thêm).

## 5. Runtime files

| File | Vai trò |
|------|---------|
| `nodes/agent/execute-reasoning.ts` | Controller: cổng chung, `runSqlPipeline`, `runToolChat` |
| `nodes/agent/reasoning/sql.ts` | Quy tắc SQL, parse reply (`sql` / `ASK`), repair suffix, merge schema, nhận diện lỗi Oracle |
| `nodes/agent/reasoning/present.ts` | Câu refuse/clarify theo ngôn ngữ user, prompt `ask`, clip trace |
| `nodes/agent/reasoning/safety.ts` | Rule classify + LLM review |
| `nodes/agent/reasoning/tools.ts` | Lọc tool theo safety, `ask_user`, bỏ retrieve khi đã grounded |
| `nodes/agent/reasoning/cite.ts`, `memory.ts`, `rewrite-question.ts` | Citation, session memory, rewrite câu hỏi truy xuất |
| `nodes/agent/execute.ts` | Dispatcher khi `agentKind === reasoning_agent` |
| UserDO `agent_session_memory` | Tóm tắt phiên (memoryKey = workflowId:sessionId:agentId) |

Chat (`workflow-chat.ts`) nhánh cùng controller. Sơ đồ: `nodes/agent/execute-reasoning.mmd`.

## 6. Anti-patterns

- Không sửa hành vi `tools_agent`
- Không để model tự gọi `get_rag` / `check_sql` trong nhánh SQL — host làm, để vòng lặp đoán được và ít token
- Không bịa citation URL
- Không gọi LLM khi rule safety đã refuse
