# Node: Get DB Info (`tool_node:get-db-info`)

> **Trạng thái:** Draft — thay spec “introspect + schema + sqlexample”  
> **Kiến trúc:** [`tool-nodes.md`](./tool-nodes.md)  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "get-db-info"`

Tool **chỉ liệt kê tên bảng**. Schema cột, sample row, SQL history, và document Vectorize thuộc [`saveRag.md`](./saveRag.md).

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node:get-db-info` |
| **Vai trò** | Data-flow: Form → node này → Loop → Save RAG. Agent tool: trả danh sách bảng khi model hỏi có những bảng nào |
| **Input** | Oracle `user` / `password` / `connectString` (và schema) từ node trước |
| **Output** | `{ items: [{ tableName, schemaName }], schemaName, connection }` — connection được chuyển tiếp để Save RAG introspect, Get DB Info không đọc cột |

---

## 2. Hành vi

1. Resolve connect config qua `shared/db/connect-config.ts` (expression `userField`, `passwordField`, `connectStringField`, `schemaNameField`).
2. `shared/db/oracle-client.listTables(schema)`.
3. Bỏ bảng hệ thống (tên chứa `$`). Áp `tableFilter`: `*`, danh sách phẩy, hoặc glob.
4. Emit một item mỗi bảng: `{ tableName, schemaName }`. Các field connect trên INPUT được giữ để node sau dùng.
5. Không gọi `introspectTable`, không lấy sample, không lấy SQL history, không dựng markdown, không gọi LLM.

Agent tool `get_db_info` dùng cùng hàm list. Input tùy chọn `schemaName`. Output:

```ts
{ ok: true, schemaName: string, tables: string[], count: number }
```

Thiếu user / password / connectString → lỗi rõ, không fallback sang database của nền tảng.

---

## 3. Config (`node.data`)

| Field | Default | Mô tả |
|-------|---------|--------|
| `toolName` | `get_db_info` | Tên function khi gắn Agent |
| `toolDescription` | List table names in the connected Oracle schema. | |
| `userField` | expression hiện tại | |
| `passwordField` | expression hiện tại | |
| `connectStringField` | expression hiện tại | |
| `schemaNameField` | | Trống → schema = Oracle user |
| `tableFilter` | `*` | |

Bỏ khỏi panel và defaults: `includeSampleRows`, `sampleRowLimit`, `includeSqlHistory`, `sqlHistoryLimit`, `sqlHistorySource`. `sqlHistoryLimit` chuyển sang Save RAG. Hàm `fetchOracleSqlHistoriesDirect` chuyển vào `shared/db`, Save RAG gọi khi dựng SQL example.

---

## 4. File map mục tiêu

| File | Vai trò |
|------|---------|
| `nodes/tool/get-db-info/module.ts` | `ToolModule` |
| `nodes/tool/get-db-info/execute.ts` | Chỉ list + emit items |
| `nodes/tool/shared/db/connect-config.ts` | Chuyển từ folder này |
| `nodes/tool/shared/db/oracle-client.ts` | `listTables` (và introspect / execute cho tool khác) |

Xóa khỏi folder này: `documents.ts`, `introspectTableToRagDocuments`, `introspectTablesToRagDocuments`. Form trigger import `listTables` từ `shared/db`, không từ tool này.

`execute.ts` của Save RAG không được import file trong folder này.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.3 | 2026-09-22 | Chỉ liệt kê bảng. Schema và document chuyển sang Save RAG |
| 0.2 | 2026-09-11 | D1 + Oracle proxy (introspect + history) — superseded |
