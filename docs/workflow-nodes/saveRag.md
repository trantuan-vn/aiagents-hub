# Node: Save RAG (`tool_node:save-rag`)

> **Trạng thái:** Done  
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
| **Loại plugin** | Resource + execute pipeline (data-flow) + Agent tool |
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
| `pipeline_auto` | Graph execute `executeSaveRagPipeline` — chunk + embed + upsert, không cần LLM gọi tool |

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

**Execute** (`nodes/tool/save-rag/execute.ts`):

1. Resolve `collection`, `namespace` từ Agent/memory (`resolveRagResources`)
2. Embed endpoint từ service (`resolveRagEmbedService`)
3. PDF: `extractTextFromPdfFiles` nếu input là files
4. Split `content` (`chunk.ts`) nếu chưa có `chunks`
5. `embedTextsWithUsage` → `upsertVectors`
6. Return `{ ok, saved, documentId, collection }`
7. BT3: có thể `introspectTablesToRagDocuments` khi input là DB catalog

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

## 7. File map

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes/src/nodes/tool/definition.ts` | `SAVE_RAG_TOOL_DEFINITION` |
| `workers/auth-worker/.../nodes/tool/save-rag/execute.ts` | Pipeline + tool execute |
| `workers/auth-worker/.../nodes/tool/save-rag/chunk.ts` | Text chunking |
| `workers/auth-worker/.../nodes/tool/save-rag/pdf-extract.ts` | PDF → text |
| `workers/auth-worker/.../nodes/tool/index.ts` | `toolSaveRagPlugin` (`execute: executeToolNode`) |
| `workers/auth-worker/.../execution/agent-runtime.ts` | `buildRagToolset` |
| `workers/web/.../nodes/tool/` | `toolSaveRagUIPlugin` |

`TOOL_OVERRIDE_KINDS` = `save-rag`, `get-rag`, `get-db-info`.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2 | 2026-09-11 | Execute + PDF + pipeline live |
