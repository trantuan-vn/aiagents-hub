# Node: Get RAG (`tool_node:get-rag`)

> **Trạng thái:** Draft — retrieve schema để Reasoning Agent viết SQL  
> **Kiến trúc:** [`tool-nodes.md`](./tool-nodes.md)  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "get-rag"`  
> **Liên kết:** [`saveRag.md`](./saveRag.md) · [`schema.md`](./schema.md) · [`sqlexample.md`](./sqlexample.md) · [`reasoning-agent.md`](./reasoning-agent.md) · [`save-rag-completeness-spec.md`](./save-rag-completeness-spec.md)

Tool **đọc** Vectorize theo câu hỏi của user và trả schema (cột + mô tả VI/EN) cùng SQL example của các bảng liên quan, để Reasoning Agent viết SQL. Nó không introspect Oracle và không chạy SQL.

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node:get-rag` |
| **Vai trò** | Tool `retrieve` của Reasoning Agent, hoặc prefetch trên data-flow trước Agent |
| **Query** | Câu hỏi user (`query` của tool call, hoặc `queryField` trên INPUT) |
| **Output** | Các bảng liên quan. Mỗi bảng gồm document schema và document SQL example, đã ghép đủ chunk |

---

## 2. Execute

1. Resolve collection / namespace / embed model qua `shared/rag-context.ts` (cùng index Save RAG đã ghi).
2. Embed **nguyên câu hỏi**, không viết lại câu hỏi.
3. `queryCollection` top-K trên cả `docType=schema` và `docType=sqlexample`.
4. Gom match theo `groupByField` (mặc định `tableName`). Query chỉ để chọn bảng. Chunk của bảng đã chọn được đọc bằng id hash, ghép đúng lát cắt Save RAG đã ghi. Schema đứng trước SQL example. Thiếu chunk schema thì bỏ bảng, không trả document cụt. Không có sqlexample vẫn trả schema. Hợp đồng đầy đủ: [`save-rag-completeness-spec.md`](./save-rag-completeness-spec.md) mục 9.
5. Trả:

```ts
{
  snippets: Array<{
    text: string;       // schema (VI + EN) rồi SQL example của cùng bảng
    tableName: string;
    schemaName: string;
    source: string;
    score: number;
  }>;
  count: number;        // số bảng, không phải số chunk
}
```

`topK` là số **bảng** giữ lại sau khi gom, mặc định 12. `scoreThreshold` lọc match trước khi gom.

Không gọi Get DB Info, Save RAG, hay Check SQL. Không lọc theo tên bảng hardcode.

---

## 3. Cách Reasoning Agent dùng

1. Gọi `get_rag` với câu hỏi user trước khi viết SQL.
2. Đọc `descriptionVi` / `aliasesVi` để map từ người dùng sang tên cột. Đọc SQL example của cùng bảng như few-shot.
3. Viết một câu SELECT. Bước kiểm tra thuộc [`check-sql.md`](./check-sql.md), không thuộc tool này.

Pipeline (Webhook → Get RAG → Agent): `querySource: from_agent_input`, question từ `queryField`. Snippet nằm trên INPUT; Agent bỏ tool `get_rag` khỏi loop nếu upstream đã có snippet (giữ hành vi hiện tại).

---

## 4. Config

Giữ `toolName` `get_rag`, `queryField`, `groupByField`, `topK`, `scoreThreshold`, `querySource`, `includeMetadata`.

Giá trị để không cắt schema nằm ở [`save-rag-completeness-spec.md`](./save-rag-completeness-spec.md) mục 9.0: `topK` **12** bảng, `scoreThreshold` **0**, `groupByField` **`tableName`**, `includeMetadata` **true**, `querySource` **`from_agent_input`**. `topK` và `scoreThreshold` chỉ chọn bảng. Chunk của bảng đã chọn được đọc hết.

`toolDescription` nói rõ: tìm schema bảng liên quan tới câu hỏi để viết SQL; đừng gọi khi đã có snippet schema trong context.

---

## 5. File map mục tiêu

| File | Vai trò |
|------|---------|
| `get-rag/module.ts` | `ToolModule`, `toolClass: retrieve` |
| `get-rag/execute.ts` | Embed + query + hydrate |
| `get-rag/assemble.ts` | Gom theo bảng, ghép schema rồi SQL example |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.8 | 2026-09-28 | Mặc định mục 9.0: topK 12, scoreThreshold 0, groupBy tableName |
| 0.7 | 2026-09-28 | Đọc theo mục 9 spec đủ dữ liệu: id hash, nối lát cắt, bỏ bảng khi schema thiếu chunk |
| 0.6 | 2026-09-28 | Trỏ hợp đồng hydrate đủ chunk: [`save-rag-completeness-spec.md`](./save-rag-completeness-spec.md) |
| 0.5 | 2026-09-22 | Mỗi bảng trả schema + SQL example |
| 0.4 | 2026-09-22 | Retrieve schema song ngữ cho Reasoning Agent |
| 0.3 | 2026-09-14 | Hydrate group theo `groupByField` |
