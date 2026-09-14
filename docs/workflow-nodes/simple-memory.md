# Node: Simple Memory (`memory_node:simple`)

> **Trạng thái:** Done  
> **Family:** [`vectorize.md`](./vectorize.md) (cùng `memory_node`)  
> **Kind:** `simple` — song song `vectorize`, không thay RAG/Vectorize.

Memory resource lưu **cửa sổ hội thoại** (user/assistant) trong Durable Object của user. Nối vào handle **Memory** của Agent.

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `memory_node:simple` |
| **runtimeType** | `memory_node` |
| **memoryKind** | `simple` |
| **Vai trò** | Chat memory theo session, không cần credentials |
| **Loại plugin** | Resource (`skipExecution: true`) |
| **Nối tới Agent** | `memory_node.memory` → `agent.memory` (đứt nét) |

Không nối vào Get RAG / Save RAG — các tool đó chỉ nhận Vectorize.

## 2. Graph

```json
{
  "type": "memory_node",
  "data": {
    "label": "Simple Memory",
    "memoryKind": "simple",
    "sessionIdSource": "from_chat_trigger",
    "sessionKey": "{{ $json.sessionId }}",
    "contextWindowLength": 5
  }
}
```

## 3. Config

| Field | Default | Mô tả |
|-------|---------|--------|
| `sessionIdSource` | `from_chat_trigger` | `from_chat_trigger` lấy `sessionId` từ Chat Trigger / `$json.sessionId`; `define_below` dùng `sessionKey` |
| `sessionKey` | `{{ $json.sessionId }}` | Expression khi define below, hoặc extract từ node trước |
| `contextWindowLength` | `5` | Số lượt tương tác (cặp user+assistant) đưa vào model |

Session key = `workflowId:sessionId:memoryNodeId` — **chỉ scope node này**. Cùng key trên nhiều Simple Memory node thì mới share.

## 4. Runtime

| File | Vai trò |
|------|---------|
| `nodes/memory-node/simple.ts` | Load/save cửa sổ chat |
| UserDO `simple_memory` | SQLite DO-local |
| `resolveAgentResources` | `memoryKind=simple`, không set Vectorize collection |
| `executeAgent` / `execute-reasoning` / `workflow-chat` | Inject history + persist turn |

## 5. Anti-patterns

- Không dùng Simple Memory cho RAG (Vectorize)
- Không default `collection: VECTORIZE` khi kind là `simple`
- Không enqueue `memory_node` vào execution queue
