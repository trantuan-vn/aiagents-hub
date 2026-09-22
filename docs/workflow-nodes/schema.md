# Artifact: `schema.md` (table schema document)

> **Loại:** Document artifact — **không phải** canvas node  
> **Sinh bởi:** [`saveRag`](./saveRag.md) sau khi introspect bảng và LLM viết mô tả cột  
> **Lưu bởi:** Save RAG → [`vectorize`](./vectorize.md)  
> **Dùng lại:** [`getRag`](./getRag.md) + [`reasoning-agent`](./reasoning-agent.md) để viết SQL  
> **Kiến trúc:** [`tool-nodes.md`](./tool-nodes.md)

Mỗi **bảng** × **mỗi execution** tạo **một** `schema.md`. File name logic: `{dbId}.{schemaName}.{tableName}.schema.md`.

---

## 1. Vai trò

| Khía cạnh | Mô tả |
|-----------|-------|
| **Nội dung** | Mô tả cấu trúc bảng dạng markdown — human + LLM friendly |
| **Nguồn** | Oracle introspect + LLM mô tả cột, cả hai trong Save RAG |
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
- VI: Một câu mô tả nghiệp vụ bảng.
- EN: One-line business description of the table.

## Columns

| Column | Type | Nullable | Default | Description (VI) | Description (EN) |
|--------|------|----------|---------|----------------|----------------|
| id | uuid | NO | gen_random_uuid() | Khóa chính đơn hàng | Primary key |
| user_id | uuid | NO | | Khách đặt hàng. FK → users.id | Ordering customer. FK → users.id |
| total | numeric(12,2) | NO | 0 | Tổng tiền đơn | Order total |
| created_at | timestamptz | NO | now() | Thời điểm tạo đơn | Created at |

`aliasesVi` (ví dụ `tổng tiền`, `doanh thu` cho `total`) nằm trong cùng section cột hoặc ngay dưới bảng, để Get RAG khớp câu hỏi tiếng Việt.

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
Tối đa 3 dòng, chuỗi cắt ngắn. Không suy diễn thêm ngoài giá trị Oracle trả về.
```

---

## 3. Ai viết document

Save RAG gọi LLM một lần mỗi bảng (`save-rag/describe-table.ts`). Model điền summary, mô tả cột, và các câu SELECT thông thường. Phần history của [`sqlexample.md`](./sqlexample.md) lấy nguyên từ `ADMIN.DBTOOLS$EXECUTION_HISTORY`, không do LLM viết. Tên cột, kiểu, PK/FK, DDL lấy từ Oracle, không để LLM bịa.

Không còn Agent ingest viết hai file này.

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
| 0.2 | 2026-09-22 | Save RAG sinh document; mỗi cột có mô tả VI + EN |
| 0.1 | 2026-06-13 | Draft — schema artifact for BT3 |
