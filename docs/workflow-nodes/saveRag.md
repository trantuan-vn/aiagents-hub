# Node: Save RAG (`tool_node:save-rag`)

> **Trạng thái:** Draft (review)  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "save-rag"`  
> **Liên kết:** [`agent.md`](./agent.md) · [`service.md`](./service.md) · [`vectorize.md`](./vectorize.md) · [`rag-recipes.md`](./rag-recipes.md#bài-toán-1-ingest-pdf--vectorize) · [`schema.md`](./schema.md) · [`sqlexample.md`](./sqlexample.md)

Tool **ghi knowledge** vào Vectorize: nhận chunk + embedding (hoặc raw text để embed qua Service), upsert vào collection từ Memory node đã nối Agent.

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node` (variant `save-rag`) |
| **Category** | `resource` |
| **Vai trò** | Tool callable của Agent — persist vectors + metadata |
| **Loại plugin** | Resource + tool executor (Phase 2) |
| **Nối tới Agent** | `tool_node.tools` → `agent.tools` (đứt nét, có thể nhiều tool) |
| **Phụ thuộc** | [`service.md`](./service.md) (embed), [`vectorize.md`](./vectorize.md) (store) |

---

## 2. Graph representation

```json
{
  "id": "tool_save_rag",
  "type": "tool_node",
  "position": { "x": 640, "y": 280 },
  "data": {
    "label": "Save RAG",
    "toolKind": "save-rag",
    "toolName": "save_rag",
    "toolDescription": "Embed document chunks and upsert into the knowledge base.",
    "chunkSize": 800,
    "chunkOverlap": 120,
    "documentIdField": "{{ $json.body.documentId }}",
    "contentField": "{{ $json.body.text }}",
    "sourceField": "{{ $json.body.filename }}",
    "inputMode": "agent_tool_call"
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
| **Label** | `label` | text | `"Save RAG"` | Tên canvas |
| **Tool kind** | `toolKind` | select | `"save-rag"` | Cố định cho variant này |
| **Tool name** | `toolName` | text | `"save_rag"` | Tên function AI SDK (snake_case) |
| **Description** | `toolDescription` | textarea | — | Mô tả cho model khi tool-calling |
| **Chunk size** | `chunkSize` | number | `800` | Ký tự / token mỗi chunk |
| **Chunk overlap** | `chunkOverlap` | number | `120` | Overlap giữa chunks |
| **Document ID field** | `documentIdField` | expression | — | Expression lấy id từ upstream / tool args |
| **Content field** | `contentField` | expression | — | Text hoặc extracted PDF text |
| **Source field** | `sourceField` | expression | — | Filename / URL metadata |
| **Input mode** | `inputMode` | select | `"agent_tool_call"` | `agent_tool_call` \| `pipeline_auto` |

**Input mode:**

| Value | Hành vi |
|-------|---------|
| `agent_tool_call` | Agent quyết định gọi tool sau khi xử lý PDF (mặc định — khớp bài toán 1) |
| `pipeline_auto` | Sau Agent nhận webhook, runtime tự chunk+embed+save không cần LLM gọi tool (Phase 3) |

---

## 5. Tool schema (AI SDK)

**Input schema (agent gọi tool):**

```typescript
{
  documentId?: string;
  content: string;           // Full text hoặc chunk
  source?: string;           // pdf filename
  chunks?: Array<{           // Optional — agent đã split sẵn
    content: string;
    index: number;
  }>;
  metadata?: Record<string, string>;  // BT3: docType, tableName, dbId
}
```

**Execute (Phase 2 — `nodes/tool/save-rag.ts`):**

1. Resolve `collection`, `namespace` từ Agent memory resource ([`vectorize.md`](./vectorize.md))
2. Resolve embed endpoint từ Agent service resource ([`service.md`](./service.md))
3. Split `content` nếu chưa có `chunks`
4. Embed từng chunk → vector
5. `vectorize.upsert([{ id, values, metadata }])`
6. Return `{ saved: number, documentId, collection }`

**Output tool:**

```json
{
  "ok": true,
  "saved": 12,
  "documentId": "doc-abc",
  "collection": "vectorize-default"
}
```

---

## 6. Vai trò trong bài toán 1 (ingest PDF)

Luồng: **Webhook (PDF) → Agent → Service (embed) → saveRag → Vectorize**

1. Webhook đặt file PDF / extracted text vào `body.files[]` hoặc `body.text`
2. Agent INPUT hiển thị webhook output ([`agent.md`](./agent.md) §4.1)
3. Agent prompt hướng dẫn: extract text → gọi `save_rag`
4. Service node cung cấp embedding model
5. `save_rag` ghi vào index Vectorize đã khai báo

Chi tiết graph mẫu: [`rag-recipes.md`](./rag-recipes.md#bài-toán-1-ingest-pdf--vectorize).

---

## 7. File map (mục tiêu)

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes/src/nodes/tool/save-rag.ts` | Registry definition |
| `workers/auth-worker/.../nodes/tool/save-rag.ts` | Tool executor + register |
| `workers/auth-worker/.../agent-runtime.ts` | `buildRagToolset()` — gom save/get |
| `workers/web/.../nodes/tool/save-rag/` | UI plugin + defaults |

**Hiện tại:** `toolKind` chỉ có `http-request` \| `code` trong `builtins.ts` — cần thêm `save-rag`.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-13 | Draft — save-rag tool variant |
