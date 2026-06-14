# Artifact: `sqlexample.md` (SQL examples document)

> **Loại:** Document artifact — **không phải** canvas node  
> **Sinh bởi:** Agent (sau [`getDBInfo`](./getDBInfo.md))  
> **Lưu bởi:** [`saveRag`](./saveRag.md) → [`vectorize`](./vectorize.md)  
> **Dùng lại:** [`getRag`](./getRag.md) + Agent (BT3 — Text-to-SQL)

Mỗi **bảng** × **mỗi execution** tạo **một** `sqlexample.md`. File name logic: `{dbId}.{schemaName}.{tableName}.sqlexample.md`.

---

## 1. Vai trò

| Khía cạnh | Mô tả |
|-----------|-------|
| **Nội dung** | Ví dụ SQL thực tế + pattern từ lịch sử query |
| **Nguồn** | `get_db_info.sqlHistory` (10 query) + Agent suy diễn pattern từ `sampleRows` |
| **Vectorize** | `docType: sqlexample` |
| **Mục tiêu retrieve** | Few-shot SQL cho Agent khi trả lời câu hỏi user |

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

## 3. Mapping từ get_db_info

| Nguồn `get_db_info` | Section sqlexample.md |
|---------------------|------------------------|
| `sqlHistory[i].sql` | `## Historical queries` |
| `sqlHistory[i].executedAt` | bullet metadata |
| `sampleRows` | Gợi ý `## Suggested patterns` |
| `columns` + `foreignKeys` | JOIN examples trong Suggested |

Agent **normalize** SQL (format, qualify schema) trước khi save.

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
| 0.1 | 2026-06-13 | Draft — sqlexample artifact for BT3 |
