# Node: Get DB Info (`tool_node:get-db-info`)

> **Trạng thái:** Done  
> **Runtime type:** `tool_node` · **Kind:** `toolKind: "get-db-info"`  
> **Liên kết:** [`trigger.md`](./trigger.md) · [`schema.md`](./schema.md) · [`sqlexample.md`](./sqlexample.md) · [`agent.md`](./agent.md)

Tool introspect **một bảng** trong database đã khai báo ở [`trigger.md`](./trigger.md): schema, **10 dòng mẫu**, **10 SQL lịch sử** liên quan bảng. Agent dùng output để sinh artifact [`schema.md`](./schema.md) và [`sqlexample.md`](./sqlexample.md).

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `tool_node` (variant `get-db-info`) |
| **Category** | `resource` |
| **Vai trò** | Tool callable của Agent — DB catalog snapshot |
| **Input context** | `tableName`, connection từ trigger upstream |
| **Nối Agent** | `tools` handle (đứt nét) |

---

## 2. Graph representation

```json
{
  "id": "tool_dbinfo",
  "type": "tool_node",
  "position": { "x": 640, "y": 280 },
  "data": {
    "label": "Get DB Info",
    "toolKind": "get-db-info",
    "toolName": "get_db_info",
    "toolDescription": "Load table schema, sample rows, and recent SQL history for the current table.",
    "includeSampleRows": true,
    "includeSqlHistory": true,
    "sampleRowLimit": 10,
    "sqlHistoryLimit": 10,
    "sqlHistorySource": "audit_log"
  }
}
```

---

## 3. Config panel — Parameters

| Field UI | `node.data` key | Type | Default | Mô tả |
|----------|-----------------|------|---------|-------|
| **Tool kind** | `toolKind` | select | `get-db-info` | Cố định variant |
| **Tool name** | `toolName` | text | `get_db_info` | AI SDK function name |
| **Description** | `toolDescription` | textarea | — | Hướng dẫn Agent khi gọi |
| **Sample rows** | `includeSampleRows` | toggle | `true` | Lấy N dòng mẫu |
| **Sample limit** | `sampleRowLimit` | number | `10` | Override trigger limit |
| **SQL history** | `includeSqlHistory` | toggle | `true` | Lấy lịch sử query |
| **History limit** | `sqlHistoryLimit` | number | `10` | Số query tối đa |
| **History source** | `sqlHistorySource` | select | `audit_log` | `audit_log` \| `pg_stat` \| `custom_table` |

**sqlHistorySource:**

| Value | Mô tả |
|-------|-------|
| `audit_log` | Bảng audit nội bộ (D1 / app log) filter theo `tableName` |
| `pg_stat` | `pg_stat_statements` (Postgres) — normalize table ref |
| `custom_table` | `sqlHistoryTable` + query template (Phase 2+) |

---

## 4. Tool schema (AI SDK)

**Input** (Agent gọi — thường auto từ trigger input):

```typescript
{
  tableName?: string;       // Default: trigger output tableName
  schemaName?: string;
  sampleRowLimit?: number;
  sqlHistoryLimit?: number;
}
```

**Output:**

```typescript
{
  dbId: string;
  schemaName: string;
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    comment?: string;
  }>;
  primaryKey: string[];
  foreignKeys: Array<{
    column: string;
    refTable: string;
    refColumn: string;
  }>;
  ddl: string;
  sampleRows: Record<string, unknown>[];   // max 10
  sqlHistory: Array<{
    sql: string;
    executedAt?: string;
    durationMs?: number;
    rowCount?: number;
  }>;                                       // max 10, filtered by table
  rowCountEstimate?: number;
}
```

Agent **bắt buộc** gọi `get_db_info` đầu pipeline ingest BT3 (trước khi viết schema/sqlexample).

---

## 5. Execute

**File:** `workers/auth-worker/.../nodes/tool/get-db-info/execute.ts`

1. Resolve connection từ trigger payload + `connect-config.ts` (Oracle) / credentials
2. **D1:** `sqlite_master` + `PRAGMA` / sample `SELECT`
3. **Oracle:** `oracle.ts` + `oracle-proxy-client.ts` → `services/oracle-proxy` (hoặc `@aiagents-hub/oracle-db`)
4. `documents.ts` → artifact schema / sqlexample cho save-rag
5. `listDatabaseTables` dùng bởi `form-trigger-runner.ts`

**Bảo mật:**

- Introspect + SELECT mẫu — không chạy SQL tùy ý từ user qua tool này
- Credential không log plain text
- Oracle đi qua proxy HTTP, không mở TCP trực tiếp từ Worker

## 6. File map

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes/src/nodes/tool/definition.ts` | `GET_DB_INFO_TOOL_DEFINITION` |
| `nodes/tool/get-db-info/execute.ts` | Introspect D1 + Oracle |
| `nodes/tool/get-db-info/oracle.ts` | Oracle metadata |
| `nodes/tool/get-db-info/oracle-proxy-client.ts` | HTTP tới oracle-proxy |
| `nodes/tool/get-db-info/connect-config.ts` | Resolve connect string / credential |
| `nodes/tool/get-db-info/documents.ts` | RAG documents (schema + sqlexample) |
| `services/oracle-proxy/` | Node Hono proxy `oracledb` |

---

## 6. Luồng BT3 (một bảng / một execution)

```
trigger:form (tableName=orders)
  → Agent gọi get_db_info
  → Agent sinh schema.md + sqlexample.md
  → save_rag (2 documents)
  → Vectorize namespace dbId
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2 | 2026-09-11 | D1 + Oracle proxy execute live |
