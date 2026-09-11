# Workflow Node Specs — Index

Thư mục chứa **spec từng node** — dùng làm hướng dẫn khi phát triển với Cursor hoặc onboard developer.

**Spec chính:** [`workflow-node-plugin-spec.md`](../workflow-node-plugin-spec.md)  
**Kiến trúc khung:** [`workflow-node-plugin-architecture.md`](../workflow-node-plugin-architecture.md)  
**Luồng vận hành:** [`workflow-how-it-works.md`](../workflow-how-it-works.md)

---

## Node specs

| Node | Spec | Module folders | Trạng thái |
|------|------|----------------|------------|
| Webhook | [`webhook.md`](./webhook.md) | `nodes/webhook/` (shared + FE + BE) | **Done** — HTTP ingress + canvas |
| Agent | [`agent.md`](./agent.md) | `nodes/agent/` | **Done** — execute + tool loop |
| Trigger | [`trigger.md`](./trigger.md) | `nodes/trigger/` + FE `nodes/form/` | **Done** — `form` + `form-trigger-runner` |
| Flow | — | `nodes/flow/` | Family + `flowKind` (override: loop_over_items) |
| Core | — | `nodes/core/` + BE `http-request/`, `code/` | Factory; dedicated BE for http/code |
| Service | [`service.md`](./service.md) | `nodes/service/` (shared+FE), `service-node/` (BE) | **Done** — resource, skipExecution |
| Vectorize | [`vectorize.md`](./vectorize.md) | `nodes/memory/` | **Done** — resource + Vectorize |
| Tool | — | `nodes/tool/` | Factory; RAG overrides có execute |
| Save RAG | [`saveRag.md`](./saveRag.md) | `nodes/tool/save-rag/` | **Done** — pipeline + PDF extract |
| Get RAG | [`getRag.md`](./getRag.md) | `nodes/tool/get-rag/` | **Done** — query Vectorize |
| Get DB Info | [`getDBInfo.md`](./getDBInfo.md) | `nodes/tool/get-db-info/` | **Done** — D1 + Oracle (oracle-proxy) |
| Human review | — | `nodes/human-review/` | Family + channel factory (gmail execute) |
| Action in app | — | `nodes/action-in-app/` | Integration actions |
| Data transform | — | `nodes/data-transformation/` | Family + `transformKind` factory |
| Sticky note | — | `nodes/sticky-note/` | Canvas-only |
| Workflow group | — | `nodes/workflow-group/` | Canvas-only |
| **RAG recipes** | [`rag-recipes.md`](./rag-recipes.md) | — | Graph mẫu ingest PDF + Q&A + BT3 |
| **RAG phases** | [`rag-implementation-phases.md`](./rag-implementation-phases.md) | — | Phases P0–P10 — runtime đã xong; docs giữ lịch sử |
| schema.md | [`schema.md`](./schema.md) | — | Artifact — table schema |
| sqlexample.md | [`sqlexample.md`](./sqlexample.md) | — | Artifact — SQL examples |

Add-node drawer **vẫn** đọc `workers/web/.../catalogs/*.ts`. UI `NODE_CATALOG` chưa thay catalogs.

### Module layout (mỗi node = 1 Lego)

```
packages/workflow-nodes/src/nodes/<name>/definition.ts
workers/auth-worker/.../workflows/nodes/<name>/index.ts   (+ execute.ts | trigger.ts)
workers/web/.../workflows/_components/nodes/<name>/        (index + canvas + optional config)
```

### Family + kind (catalog expand)

Một số family (`human_review`, `data_transformation`, `flow`, `core`, `trigger`, `agent`, `tool_node`, `memory_node`) có **nhiều catalog entry** nhưng **một Lego family**:

| Layer | Pattern |
|-------|---------|
| Kind list | `nodes/<family>/kinds.ts` hoặc `channels.ts` (single source of truth) |
| Definitions | Base + factory `create*KindDefinition` → `*_KIND_DEFINITIONS` |
| BE plugins | Base + factory plugins; override modules skip factory (`OVERRIDE_KINDS`) |
| FE plugins | Base `catalog.visible: false` + kind UI plugins; override folders for custom canvas/panel |

Override examples: `webhook/`, `form/`, `http-request/`, `code/`, `flow:loop_over_items`.

---

## Tạo spec node mới

Copy template dưới đây vào `docs/workflow-nodes/<tên-node>.md`, rồi thêm dòng vào bảng index ở trên.

```markdown
# Node: <Tên hiển thị> (`<runtimeType>`[:<kind>])

> **Trạng thái:** Draft | In progress | Done
> **Kiến trúc khung:** [workflow-node-plugin-architecture.md](../workflow-node-plugin-architecture.md)

## 1. Tóm tắt

- **ID:** `<runtimeType>:<kind>` hoặc `<runtimeType>`
- **Category:** trigger | core | flow | ...
- **Vai trò:** (1–2 câu mô tả node làm gì)
- **Loại plugin:** execute only | trigger only | execute + trigger | resource (skipExecution)

## 2. Graph representation

```json
{
  "type": "<runtimeType>",
  "data": {
    "<kindField>": "<kind>",
    "...": "..."
  }
}
```

## 3. Handles

| Handle | Type | connectionType |
|--------|------|----------------|
| `in` | target | main |
| `out` | source | main |

## 4. node.data fields

| Field | Type | Default | Mô tả |
|-------|------|---------|-------|
| | | | |

## 5. File map

### Hiện tại (trước migration)

| File | Vai trò |
|------|---------|
| | |

### Mục tiêu (sau migration)

```
packages/workflow-nodes/src/nodes/<name>/
workers/auth-worker/.../workflows/nodes/<name>/
workers/web/.../build/workflows/_components/nodes/<name>/
```

### Cấu trúc workflows (tham chiếu)

```
workers/auth-worker/.../workflows/
├── api/          # presentation, hooks-presentation
├── domain/       # schemas, constants
├── execution/    # context, store, node-runtime, agent-runtime
├── engine/       # executor, graph-helpers, flow-helpers
├── nodes/        # plugin registry
└── triggers/     # triggers.ts, channel-hooks, webhook-auth

workers/web/.../build/workflows/_components/
├── canvas/       # workflow-canvas
├── editor/       # shell, header, sidebar
├── add-node/     # drawer, panel
├── edges/        # connection utils, handles
├── layout/       # definition, placement
├── nodes/        # canvas components + UI plugin registry
├── panels/       # node-config + workflow-panels
├── catalogs/     # add-node catalog (tạm thời)
└── hooks/        # state, undo, collab
```

## 6. Backend

### Execute (nếu có)

- Input: ...
- Output: ...
- File: `nodes/<name>/execute.ts`

### Trigger (nếu có)

- Type: ...
- Public URL: ...
- File: `nodes/<name>/trigger.ts`

## 7. Frontend

### Canvas

- Component: `nodes/<name>/canvas.tsx`
- Dùng chung với node khác? (có/không)

### Config panel

- [ ] Generic 3-column đủ
- [ ] Custom panel: `config-panel.tsx`

### Defaults

```typescript
export function <name>NodeDefaults(id: string): Record<string, unknown> {
  return { ... };
}
```

## 8. Registry schema

Sections: input | parameters | output

(Key fields liệt kê hoặc link tới `@aiagents-hub/workflow-nodes`)

## 9. i18n keys

Namespace: `WorkflowNodeRegistry`, `WorkflowEditorPage`

| Key | EN | VI |
|-----|----|----|
| | | |

## 10. Checklist triển khai

- [ ] Spec reviewed
- [ ] Shared definition (Phase 2+)
- [ ] Backend plugin
- [ ] Frontend plugin
- [ ] Register trong nodes/index.ts (BE + FE)
- [ ] i18n
- [ ] Tests
- [ ] Re-export shims (backward compat)

## 11. Hướng dẫn Cursor

Khi implement node này, Cursor nên:

1. Đọc [kiến trúc khung](../workflow-node-plugin-architecture.md) trước.
2. Đọc spec này.
3. (Nếu có) tham chiếu node mẫu: [webhook.md](./webhook.md).
5. Không sửa `engine/executor.ts` để thêm case type — tạo plugin trong `nodes/<name>/`.
6. Add-node drawer vẫn cần `catalogs/*.ts` cho đến khi chuyển sang `NODE_CATALOG`.

Prompt gợi ý:

> Implement `<name>` node theo spec `docs/workflow-nodes/<name>.md`
> và kiến trúc `docs/workflow-node-plugin-architecture.md`.
> Tham chiếu webhook node nếu cần pattern trigger/custom panel.

## 12. Edge cases & notes

(Ghi các điểm đặc biệt, dual model, limitations)

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | YYYY-MM-DD | Initial |
```

---

## Quy ước đặt tên file spec

| Node | File spec |
|------|-----------|
| Webhook trigger/core | `webhook.md` |
| HTTP Request | `http-request.md` |
| Schedule / Cron | `schedule.md` |
| IF / Switch | `flow-if.md`, `flow-switch.md` (hoặc gom `flow.md`) |

Dùng **kebab-case**, một file cho một "plugin family" nếu trigger + core variant dùng chung logic (như webhook).
