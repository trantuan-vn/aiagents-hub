# Artifact: `sqlexample.md` (SQL examples document)

> **Loại:** Document artifact — **không phải** canvas node  
> **Sinh bởi:** [`saveRag`](./saveRag.md) — history Oracle ghép với logic thông thường do LLM viết cùng lúc với [`schema.md`](./schema.md)  
> **Lưu bởi:** Save RAG, service embed → [`vectorize`](./vectorize.md)  
> **Dùng lại:** [`getRag`](./getRag.md) + Reasoning Agent  
> **Kiến trúc:** [`tool-nodes.md`](./tool-nodes.md)

Mỗi **bảng** × **mỗi execution** tạo **một** `sqlexample.md`. File name logic: `{dbId}.{schemaName}.{tableName}.sqlexample.md`.

---

## 1. Vai trò

| Khía cạnh | Mô tả |
|-----------|-------|
| **Nội dung** | Câu đã chạy trên bảng, rồi các câu SELECT thông thường của bảng đó |
| **Nguồn** | (1) `ADMIN.DBTOOLS$EXECUTION_HISTORY` lọc theo tên bảng. (2) LLM viết logic hay gặp: tra khóa, lọc ngày, đếm, gom nhóm, join FK |
| **Vectorize** | `docType: sqlexample` |
| **Mục tiêu retrieve** | Few-shot để Reasoning Agent viết SQL sát câu hỏi user |

---

## 2. Cấu trúc bắt buộc

```markdown
---
docType: sqlexample
dbId: analytics-db
schemaName: public
tableName: orders
generatedAt: 2026-06-13T10:00:00Z
---

# SQL examples: public.orders

## Historical queries (from audit log)

### 1. Recent aggregate
```sql
SELECT date_trunc('day', created_at) AS day, SUM(total) AS revenue
FROM public.orders
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```
- Executed: 2026-06-10T14:22:00Z
- Rows returned: 30

### 2. Join pattern
```sql
SELECT o.id, u.email, o.total
FROM public.orders o
JOIN public.users u ON u.id = o.user_id
WHERE o.total > 100;
```
...

(up to 10 entries from sqlHistory)

## Suggested patterns (Agent-generated)

### Filter by date range
```sql
SELECT * FROM public.orders
WHERE created_at BETWEEN :start AND :end;
```

### Count by status
```sql
SELECT status, COUNT(*) FROM public.orders GROUP BY status;
```

## Anti-patterns / notes
- Always qualify table as `public.orders`
- Prefer indexed columns: user_id, created_at
```

---

## 3. Hai nguồn

| Phần | Nguồn | Ghi vào document |
|------|--------|------------------|
| `## Historical queries` | `fetchOracleSqlHistoriesDirect` đọc `ADMIN.DBTOOLS$EXECUTION_HISTORY`. Cột SQL là `STATEMENT` / `SQL_TEXT` / `SQL` / `TEXT`. Lọc `LIKE` tên bảng, `FETCH FIRST sqlHistoryLimit`. | Nguyên văn `sql`, kèm `executedAt` nếu có. Không để LLM viết lại câu này |
| `## Typical queries` | `typicalQueries` trong JSON của lần LLM | `titleVi` / `titleEn`, `sql` (một `SELECT` hoặc `WITH`), `noteVi` đưa vào text embed |

History trống → mục Historical ghi “không có”. Typical query vẫn được sinh từ schema. Cả hai trống → không upsert document sqlexample.

---

## 4. Vectorize metadata

| Key | Value |
|-----|-------|
| `docType` | `sqlexample` |
| `dbId` | từ trigger |
| `schemaName` | |
| `tableName` | |
| `source` | `{dbId}.{tableName}.sqlexample.md` |
| `namespace` | `{dbId}` |

---

## 5. Retrieve (BT3 query phase)

```json
{
  "query": "how to calculate monthly revenue from orders",
  "namespace": "analytics-db",
  "docType": "sqlexample"
}
```

Kết hợp với [`schema.md`](./schema.md) snippets → Agent sinh SQL cuối:

```sql
-- Generated answer (output Agent BT3 query workflow)
SELECT ...
```

---

## 6. Quan hệ schema vs sqlexample

| Artifact | Trả lời câu hỏi |
|----------|------------------|
| **schema.md** | Bảng có cột gì? PK/FK? Kiểu? |
| **sqlexample.md** | SQL viết thế nào? Pattern lịch sử? |

Cả hai **bắt buộc** per table trước khi BT3 query hoạt động tốt.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.3 | 2026-09-22 | History từ `ADMIN.DBTOOLS$EXECUTION_HISTORY` + typical queries do LLM |
| 0.2 | 2026-09-22 | Save RAG sinh ví dụ; embed cùng schema |
| 0.1 | 2026-06-13 | Draft — sqlexample artifact for BT3 |
