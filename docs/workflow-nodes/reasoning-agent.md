# Node: Reasoning Agent (`agent:reasoning_agent`)

> **Trạng thái:** Done (v1)  
> **Family:** [`agent.md`](./agent.md)  
> **Kind:** `reasoning_agent` — song song `tools_agent`, không thay SQL/tools agent.

Agent có vòng điều khiển: **safety → memory → clarify → plan → act → reflect → cite**.

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `agent:reasoning_agent` |
| **runtimeType** | `agent` |
| **agentKind** | `reasoning_agent` |
| **Vai trò** | LLM có nhớ phiên, hỏi lại khi thiếu dữ liệu, plan/tool policy, reflection, citation, từ chối yêu cầu nguy hiểm |

`tools_agent` giữ nguyên `executeAgent`. Kind này chạy `executeReasoningAgent`.

## 2. Output

```ts
{
  status: "ok" | "needs_clarification" | "refused",
  text: string,
  citations: [{ id, source, snippet, tool? }],
  plan?: [{ id, action, tool?, successCriterion?, risk? }],
  questions?: string[],
  confidence: number,
  reason?: string,
  category?: "illegal" | "harmful" | "jailbreak" | "policy",
  sql?: string,
  query: string,
  snippets: string[],
  endpoint: string
}
```

Graph: nếu `status === "needs_clarification"` và node `human_review` nằm downstream, engine pause như hiện tại. Agent **không** tự pause.

## 3. Options (`node.data`)

Giá trị lấy từ panel node (literal hoặc `{{ $json… }}` map từ INPUT). **Chỉ fallback khi field trống / expression không ra giá trị.**

| Key | Fallback nếu trống | Mô tả |
|-----|---------|--------|
| `maxTokens` | `4096` | Ưu tiên ô Max tokens trên agent; trống thì service, rồi 1024 |
| `clarificationMode` | `ask` | `ask` dừng để hỏi; `best_effort` vẫn trả lời |
| `requireCitations` | `true` | Ép `[n]` khi có nguồn |
| `maxReflectRetries` | `4` | Trần số vòng act+reflect (0–8). Dừng sớm hơn nếu không cải thiện |
| `noImprovementLimit` | `1` | Dừng khi N bản liên tiếp không tốt hơn bản tốt nhất (chỉ khi bản đó đã đủ dùng) |
| `maxActSteps` | `8` | Số bước gọi tool trong một lượt act (1–12) |
| `enablePlanner` | `auto` | `auto` / `on` / `off` |
| `safetyLevel` | `standard` | `strict` ẩn tool ghi trừ khi plan `risk=low` |

Nguyên tắc mặc định: **giữ bản nháp điểm cao nhất**, thử thêm một vòng sau khi đã đủ chất lượng, **dừng ngay khi vòng sau không tốt hơn**, hoặc hết `maxReflectRetries`. Heuristic SQL (từ câu hỏi + snippet schema, không hardcode tên bảng): thiếu SQL thì chưa coi là đủ dùng.

Prompt mặc định: `REASONING_AGENT_PROMPT` / `REASONING_AGENT_SYSTEM_PROMPT` — **không** dùng SQL preset.

## 4. Runtime files

| File | Vai trò |
|------|---------|
| `nodes/agent/execute-reasoning.ts` | Controller |
| `nodes/agent/reasoning/*` | Safety, frame, plan, tools, cite, reflect, memory, quality |
| `nodes/agent/execute.ts` | Dispatcher khi `agentKind === reasoning_agent` |
| UserDO `agent_session_memory` | Episodic SQLite (memoryKey = workflowId:sessionId:agentId) |

Chat (`workflow-chat.ts`) nhánh cùng controller.

## 5. Tool SQL

Khi canvas nối Get RAG và Check SQL vào handle `tools`:

1. `get_rag` với câu hỏi user — schema cột (mô tả VI/EN) và SQL example của bảng liên quan ([`getRag.md`](./getRag.md)).
2. Model viết một SELECT từ snippet đó.
3. `check_sql` chạy thử trên Oracle ([`check-sql.md`](./check-sql.md)).
4. `ok: false` → sửa SQL và gọi lại, trong `maxReflectRetries`.
5. Output `sql` chỉ lấy từ lần `check_sql` trả `ok: true`.

`toolClass: validate` không đi qua cổng `persist`. Get DB Info không nằm trên vòng này: agent không introspect catalog lúc hỏi.

## 6. Anti-patterns

- Không sửa hành vi `tools_agent`
- Không bịa citation URL
- Không gọi LLM khi rule safety đã refuse
