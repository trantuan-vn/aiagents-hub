# Node: Check SQL (`tool_node:check-sql`)

> **Trạng thái:** Draft  
> **Kiến trúc:** [`tool-nodes.md`](./tool-nodes.md)  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "check-sql"`  
> **Gắn vào:** [`reasoning-agent.md`](./reasoning-agent.md) qua handle `tools`

Tool **chạy thử** một câu SELECT Oracle. Thành công hoặc lỗi đều trả về Reasoning Agent. Lỗi không kết thúc lượt: Agent sửa SQL và gọi lại, trong trần `maxReflectRetries`.

Không có pipeline execute. Node này không đứng trên data-flow.

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node:check-sql` |
| **toolName** | `check_sql` |
| **toolClass** | `validate` — luôn có trong toolset, không bị policy `persist` chặn |
| **Input tool** | `{ sql: string }` |
| **Kết nối** | Oracle từ INPUT của Agent (cùng `user` / `password` / `connectString` mà ingest đã dùng), resolve bằng `shared/db/connect-config.ts` |

`toolDescription`: chạy câu SELECT trên Oracle và trả lỗi parser/thực thi nếu câu sai. Gọi sau khi đã có schema từ `get_rag` và trước khi coi SQL là câu trả lời. Không dùng để lấy full kết quả cho user.

---

## 2. Kiểm tra trước khi gửi Oracle

Từ chối trong tool, `ok: false`, không mở connection, nếu:

- Rỗng, hoặc nhiều statement (dấu `;` ở giữa).
- Không bắt đầu bằng `SELECT` hoặc `WITH`.
- Chứa `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `ALTER`, `TRUNCATE`, `GRANT`, `EXECUTE`, `BEGIN`, `CALL`.

Mục đích là biết câu **truy vấn** có chạy được không. Tool không phải kênh ghi dữ liệu.

---

## 3. Thực thi

Action mới trên `services/oracle-proxy`: `executeQuery`.

| Tham số | Giá trị |
|---------|---------|
| `sql` | Câu đã qua mục 2 |
| `maxRows` | `5` (config `maxRows`, trần 20) |

Proxy bọc câu trong subquery `ROWNUM` / `FETCH FIRST` để Oracle dừng sớm. Worker không nhận full result set.

Thành công:

```ts
{ ok: true, columns: string[], rowCount: number, sampleRows: Record<string, unknown>[], elapsedMs: number }
```

Thất bại (ORA-xxxxx, bảng/cột không tồn tại, kiểu sai): **không throw**.

```ts
{ ok: false, error: string, oracleCode?: string }
```

`error` là message Oracle, đủ để Agent sửa identifier. Không log password hay connect string.

`sampleRows` chỉ để Agent thấy shape khi cần; câu trả lời cho user vẫn là SQL (và lời giải thích), không phải dump bảng.

---

## 4. Vòng với Reasoning Agent

Khi agent có cả `get_rag` và `check_sql`:

1. `get_rag(question)` lấy schema.
2. Model viết một SELECT.
3. `check_sql({ sql })`.
4. `ok: true` → đưa SQL đó vào output `sql`, kết thúc nhánh SQL.
5. `ok: false` → reflect, viết lại SQL, gọi `check_sql` lần nữa. Dừng khi hết `maxReflectRetries` hoặc không cải thiện (`noImprovementLimit`).
6. Hết lượt mà chưa `ok` → output `sql` rỗng, `text` nói câu chưa chạy được và kèm lỗi Oracle cuối. Không bịa là đã chạy thành công.

`extractSql` chỉ nhận SQL từ lần `check_sql` thành công gần nhất, không lấy SQL trong prose chưa được kiểm.

`tools_agent` không đổi. Kind reasoning mới đọc tool class `validate`.

---

## 5. File map mục tiêu

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes` | Kind `check-sql`, definition, defaults |
| `nodes/tool/check-sql/module.ts` | `createAgentTool` only |
| `nodes/tool/check-sql/execute.ts` | Guard + `oracle-client.executeReadOnly` |
| `nodes/tool/shared/db/oracle-client.ts` | Action `executeQuery` |
| `services/oracle-proxy` | Handler `executeQuery` |
| `nodes/agent/reasoning/tools.ts` | `validate` không bị filter như `persist` |
| `nodes/agent/execute-reasoning.ts` | Vòng sửa SQL khi tool trả `ok: false` |
| Catalog + i18n | Một dòng builtin tool |

Test: SELECT hợp lệ → `ok: true`; ORA-00904 → `ok: false` và message nguyên; `DELETE` → từ chối trước proxy; Agent nhận `ok: false` rồi gọi tool lần hai với SQL khác.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-09-22 | Draft — probe SELECT Oracle, trả lỗi cho Reasoning Agent |
