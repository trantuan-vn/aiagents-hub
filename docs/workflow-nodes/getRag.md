# Node: Get RAG (`tool_node:get-rag`)

> **Trạng thái:** Draft (review)  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "get-rag"`  
> **Liên kết:** [`agent.md`](./agent.md) · [`service.md`](./service.md) · [`vectorize.md`](./vectorize.md) · [`rag-recipes.md`](./rag-recipes.md#bài-toán-2-hỏi-đáp--retrieve--generate)

Tool **đọc knowledge** từ Vectorize: embed query qua Service, top-K retrieve, trả snippets cho Agent đưa vào prompt trước khi gọi chat model.

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node` (variant `get-rag`) |
| **Category** | `resource` |
| **Vai trò** | Tool callable — semantic search trên Vectorize |
| **Loại plugin** | Resource + tool executor (Phase 2) |
| **Nối tới Agent** | `tool_node.tools` → `agent.tools` |
| **Phụ thuộc** | [`service.md`](./service.md) (embed query), [`vectorize.md`](./vectorize.md) (index) |

---

## 2. Graph representation

```json
{
  "id": "tool_get_rag",
  "type": "tool_node",
  "position": { "x": 640, "y": 340 },
  "data": {
    "label": "Get RAG",
    "toolKind": "get-rag",
    "toolName": "get_rag",
    "toolDescription": "Search the knowledge base for passages relevant to the user question.",
    "topK": 5,
    "scoreThreshold": 0.65,
    "querySource": "from_tool_args",
    "includeMetadata": true
  }
}
```

---

## 3. Handles

| Handle | Type | connectionType | Vị trí |
|--------|------|----------------|--------|
| `tools` | source | resource | Trên (diamond) → Agent `tools` |

---

## 4. Config panel — Parameters

| Field UI | `node.data` key | Type | Default | Mô tả |
|----------|-----------------|------|---------|-------|
| **Label** | `label` | text | `"Get RAG"` | Tên canvas |
| **Tool kind** | `toolKind` | select | `"get-rag"` | Cố định variant |
| **Tool name** | `toolName` | text | `"get_rag"` | Tên function AI SDK |
| **Description** | `toolDescription` | textarea | — | Hướng dẫn model khi nào gọi search |
| **Top K** | `topK` | number | `5` | Số snippet trả về |
| **Score threshold** | `scoreThreshold` | number | `0.65` | Lọc match score tối thiểu |
| **Query source** | `querySource` | select | `"from_tool_args"` | Nguồn câu query |
| **Include metadata** | `includeMetadata` | toggle | `true` | Trả thêm `source`, `documentId` |

**Query source:**

| Value | Hành vi |
|-------|---------|
| `from_tool_args` | Agent truyền `query` khi gọi tool (mặc định) |
| `from_agent_input` | Lấy text từ upstream INPUT (câu hỏi webhook) — auto-call Phase 3 |

---

## 5. Tool schema (AI SDK)

**Input schema:**

```typescript
{
  query: string;              // Câu hỏi / từ khóa search
  topK?: number;              // Override config node
  namespace?: string;         // Override filter metadata
}
```

**Execute (Phase 2 — `nodes/tool/get-rag.ts`):**

1. Resolve `collection`, `namespace` từ Agent memory ([`vectorize.md`](./vectorize.md))
2. Embed `query` qua Service ([`service.md`](./service.md)) — cùng model ingest
3. `vectorize.query(vector, { topK, filter })`
4. Map matches → `{ snippets, sources, count }`

**Output tool:**

```json
{
  "snippets": [
    { "text": "...", "source": "report-q1.pdf", "score": 0.82 }
  ],
  "count": 3
}
```

Agent merge snippets vào system/user message rồi gọi chat model từ Service.

---

## 6. So sánh với implicit RAG trong Agent

| Cách | Khi nào | Code hiện tại |
|------|---------|---------------|
| **Implicit** | Memory nối Agent, không có getRag tool | `executeAgent` pre-fetch `queryVectorMemory` vào system prompt |
| **Explicit (getRag)** | Agent tool-calling — model chủ động search | ⚠️ Phase 2 — `buildRagToolset` |

Spec khuyến nghị **bài toán 2** dùng **getRag explicit** để model quyết định có search hay không; vẫn **bắt buộc** nối [`vectorize.md`](./vectorize.md) để bind collection.

---

## 7. Vai trò trong bài toán 2 (Q&A)

Luồng: **Webhook (câu hỏi) → Agent → getRag (Vectorize) → Service (chat) → trả lời**

1. Webhook body: `{ "question": "..." }`
2. Agent INPUT = webhook output
3. Agent gọi `get_rag({ query: question })`
4. Snippets làm context
5. Service node chat model sinh câu trả lời grounded
6. Agent OUTPUT → webhook response / node downstream

Chi tiết graph: [`rag-recipes.md`](./rag-recipes.md#bài-toán-2-hỏi-đáp--retrieve--generate).

---

## 8. File map (mục tiêu)

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes/src/nodes/tool/get-rag.ts` | Registry |
| `workers/auth-worker/.../nodes/tool/get-rag.ts` | Tool executor |
| `workers/auth-worker/.../execution/agent-runtime.ts` | `retrieveMemory` (shared) |

**Hiện tại:** tương tự [`saveRag.md`](./saveRag.md) — `get-rag` chưa có trong registry.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-13 | Draft — get-rag tool variant |
