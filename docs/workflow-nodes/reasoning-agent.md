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

| Key | Default | Mô tả |
|-----|---------|--------|
| `clarificationMode` | `ask` | `ask` dừng để hỏi; `best_effort` vẫn trả lời |
| `requireCitations` | `true` | Ép `[n]` khi có nguồn |
| `maxReflectRetries` | `2` | 0–2 |
| `enablePlanner` | `auto` | `auto` / `on` / `off` |
| `safetyLevel` | `standard` | `strict` ẩn tool ghi trừ khi plan `risk=low` |

Prompt mặc định: `REASONING_AGENT_PROMPT` / `REASONING_AGENT_SYSTEM_PROMPT` — **không** dùng SQL preset.

## 4. Runtime files

| File | Vai trò |
|------|---------|
| `nodes/agent/execute-reasoning.ts` | Controller |
| `nodes/agent/reasoning/*` | Safety, frame, plan, tools, cite, reflect, memory |
| `nodes/agent/execute.ts` | Dispatcher khi `agentKind === reasoning_agent` |
| UserDO `agent_session_memory` | Episodic SQLite (memoryKey = workflowId:sessionId:agentId) |

Chat (`workflow-chat.ts`) nhánh cùng controller.

## 5. Anti-patterns

- Không sửa hành vi `tools_agent`
- Không bịa citation URL
- Không gọi LLM khi rule safety đã refuse
