# Node: Save RAG (`tool_node:save-rag`)

> **Trạng thái:** Draft  
> **Kiến trúc:** [`tool-nodes.md`](./tool-nodes.md)  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "save-rag"`  
> **Liên kết:** [`getDBInfo.md`](./getDBInfo.md) · [`schema.md`](./schema.md) · [`sqlexample.md`](./sqlexample.md) · [`service.md`](./service.md) · [`vectorize.md`](./vectorize.md)

Tool **ghi knowledge của một bảng**. Input là tên bảng từ Get DB Info / Loop. Nó lấy schema Oracle, nhờ LLM mô tả từng cột, dựng SQL example từ history và logic thông thường, rồi embed hai document vào Vectorize.

Không nhận PDF, không nhận text tự do, không gọi module Get DB Info.

---

## 1. Một bảng, một lượt

Loop đưa `{ tableName, schemaName }`. Connection Oracle còn trên INPUT. Đã index `tableName` trong run thì bỏ qua (`INDEXED_TABLES_KEY`).

1. `tableName` từ `tableNameField` (mặc định `{{ $json.tableName }}`). Connection qua `shared/db/connect-config.ts`.
2. `shared/db/oracle-client.introspectTables` cho đúng bảng đó. Lấy cột, kiểu, nullable, default, comment Oracle, PK, FK, DDL, tối đa 3 sample row. Không list lại catalog.
3. `shared/db/oracle-client.fetchSqlHistory` — cùng hàm `fetchOracleSqlHistoriesDirect` hiện có. Đọc `ADMIN.DBTOOLS$EXECUTION_HISTORY`, lọc câu có tên bảng (`LIKE` trên text SQL), mới nhất trước, mặc định 10 câu (`sqlHistoryLimit`, trần 50). Bảng history không có hoặc query lỗi → lịch sử rỗng, vẫn chạy bước LLM.
4. **Một lần LLM chat** mỗi bảng, handle `llm`. Input là schema Oracle, sample đã cắt ngắn, và các câu history (nguyên văn). LLM viết mô tả cột và **phần logic thông thường**. Không nhờ LLM bịa lại câu history. Output JSON:

```ts
{
  tableSummaryVi: string;
  tableSummaryEn: string;
  columns: Array<{
    name: string;          // đúng tên cột Oracle
    descriptionVi: string;
    descriptionEn: string;
    aliasesVi: string[];
  }>;
  typicalQueries: Array<{
    titleVi: string;
    titleEn: string;
    sql: string;           // một SELECT / WITH Oracle, qualify schema.table
    noteVi: string;        // câu hỏi nghiệp vụ thông thường mà câu này trả lời
  }>;
}
```

`typicalQueries` là logic hay gặp của một bảng Oracle: tra theo khóa, lọc theo cột ngày, đếm, gom nhóm, join FK nếu có. Không copy history vào mảng này.

5. Dựng hai markdown:
   - [`schema.md`](./schema.md) — tên, kiểu, PK/FK, DDL lấy từ Oracle; mô tả cột lấy từ LLM. LLM không được bịa cột hay đổi tên.
   - [`sqlexample.md`](./sqlexample.md) — hai phần: (1) câu lấy nguyên từ `ADMIN.DBTOOLS$EXECUTION_HISTORY`; (2) `typicalQueries`.
6. Embed **cả hai** bằng service embed trên handle `service`, upsert vào Vectorize trên handle `memory`.

| Document | `documentId` | `docType` |
|----------|--------------|-----------|
| Schema | `{dbId}.{schemaName}.{tableName}.schema` | `schema` |
| SQL example | `{dbId}.{schemaName}.{tableName}.sqlexample` | `sqlexample` |

Metadata chung: `tableName`, `schemaName`, `dbId`. Text embed của schema chứa cả tiếng Việt và tiếng Anh.

Billing: một charge LLM, rồi charge embed cho các chunk của hai document.

Thiếu handle `llm` hoặc `service` → fail bảng đó, không ghi Vectorize. LLM thiếu cột hoặc đổi tên cột → giữ cột Oracle, bỏ mô tả cột đó, ghi warning. `typicalQueries` rỗng hoặc câu không phải SELECT → bỏ câu đó. History rỗng và không còn typical query → vẫn lưu schema, bỏ document sqlexample của bảng.

Sample row trong prompt và trong schema cắt ngắn, tối đa 3 dòng.

---

## 2. Handles

| Handle | Vai trò |
|--------|---------|
| `in` / `out` | Data-flow: Loop → Save RAG |
| `service` | **Embed model**. Vector hóa schema và SQL example |
| `llm` | **Chat model**. Một lần mỗi bảng. `service_node` nối vào handle này |
| `memory` | Vectorize, nơi chứa vector |

Không có handle nhận file PDF.

---

## 3. Config

`toolName` `save_rag`, `tableNameField`, `chunkSize` 800, `chunkOverlap` 120, `sqlHistoryLimit` 10.

Bỏ khỏi panel mục tiêu: `contentField`, `documentIdField`, `sourceField`, `inputMode`, prompt PDF. Prompt LLM là hằng trong `save-rag/describe-table.ts`.

---

## 4. File map mục tiêu

| File | Vai trò |
|------|---------|
| `save-rag/module.ts` | `ToolModule`, `toolClass: persist`. Pipeline only — không `createAgentTool` nhận text |
| `save-rag/execute.ts` | Introspect → LLM → hai document → embed. Không import `get-db-info/` |
| `save-rag/describe-table.ts` | Gọi chat service, parse JSON (mô tả cột + typical queries) |
| `save-rag/schema-document.ts` | Markdown schema |
| `save-rag/sql-example-document.ts` | Ghép history Oracle + typical queries |
| `save-rag/chunk.ts` | Cắt hai markdown trước khi embed |

`pdf-extract.ts` không còn trong đường này. Introspect đi qua `shared/db/oracle-client.ts`.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.5 | 2026-09-22 | SQL example = `ADMIN.DBTOOLS$EXECUTION_HISTORY` + logic thông thường do LLM |
| 0.4 | 2026-09-22 | Chỉ schema DB. LLM ra schema mới + SQL example, embed cả hai. Bỏ PDF/text |
| 0.3 | 2026-09-22 | Tự introspect, LLM mô tả cột |
| 0.2 | 2026-09-11 | Pipeline + PDF — không còn là hợp đồng |
