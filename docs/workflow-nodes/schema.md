# Artifact: `schema.md` (table schema document)

> **Loại:** Document artifact — **không phải** canvas node  
> **Sinh bởi:** Agent (sau [`getDBInfo`](./getDBInfo.md))  
> **Lưu bởi:** [`saveRag`](./saveRag.md) → [`vectorize`](./vectorize.md)  
> **Dùng lại:** [`getRag`](./getRag.md) + Agent (BT3 query — Text-to-SQL)

Mỗi **bảng** × **mỗi execution** tạo **một** `schema.md`. File name logic: `{dbId}.{schemaName}.{tableName}.schema.md`.

---

## 1. Vai trò

| Khía cạnh | Mô tả |
|-----------|-------|
| **Nội dung** | Mô tả cấu trúc bảng dạng markdown — human + LLM friendly |
| **Nguồn** | Agent tổng hợp từ `get_db_info` output |
| **Vectorize** | `docType: schema`, metadata filter khi retrieve |
| **Mục tiêu retrieve** | Agent hiểu cột, PK/FK, kiểu dữ liệu để **sinh SQL đúng** |

---

## 2. Cấu trúc bắt buộc

```markdown
---
docType: schema
dbId: analytics-db
schemaName: public
tableName: orders
generatedAt: 2026-06-13T10:00:00Z
---

# Table: public.orders

## Summary
One-line business description of the table (Agent-generated).

## Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | NO | | FK → users.id |
| total | numeric(12,2) | NO | 0 | Order total |
| created_at | timestamptz | NO | now() | |

## Primary key
- `id`

## Foreign keys
- `user_id` → `public.users(id)`

## Indexes
- `orders_user_id_idx` ON (user_id)

## DDL
```sql
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);
```

## Sample shape (from live data)
Brief note on value patterns (Agent inference from 10 sample rows).
```

---

## 3. Agent prompt (ingest)

Gợi ý system/user instruction trên Agent node BT3 ingest:

```
You receive get_db_info JSON for a single table.
Produce TWO markdown documents:
1) schema.md — follow docs/workflow-nodes/schema.md template exactly.
2) sqlexample.md — follow docs/workflow-nodes/sqlexample.md template.

Call save_rag twice with documentId:
- {dbId}.{schemaName}.{tableName}.schema
- {dbId}.{schemaName}.{tableName}.sqlexample
```

---

## 4. Vectorize metadata

| Key | Value |
|-----|-------|
| `docType` | `schema` |
| `dbId` | từ trigger |
| `schemaName` | `public`, … |
| `tableName` | bảng hiện tại |
| `source` | `{dbId}.{tableName}.schema.md` |
| `namespace` | `{dbId}` (align [`vectorize.md`](./vectorize.md)) |

**Chunking:** Chunk theo section (`## Columns`, `## DDL`, …) — `chunkSize` 800 trong saveRag.

---

## 5. Retrieve (BT3 query phase)

`get_rag` filter gợi ý:

```json
{
  "query": "orders table columns for revenue report",
  "namespace": "analytics-db",
  "docType": "schema",
  "tableName": "orders"
}
```

Agent ưu tiên snippet `docType=schema` trước khi sinh SQL.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-13 | Draft — schema artifact for BT3 |
