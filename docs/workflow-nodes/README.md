# Workflow Node Specs — Index

Thư mục chứa **spec từng node** — dùng làm hướng dẫn khi phát triển với Cursor hoặc onboard developer.

**Kiến trúc khung:** [`docs/workflow-node-plugin-architecture.md`](../workflow-node-plugin-architecture.md)

---

## Node specs

| Node | Spec | Trạng thái | Ghi chú |
|------|------|------------|---------|
| Webhook | [`webhook.md`](./webhook.md) | Reference | Trigger + custom panel + D1 trigger |
| HTTP Request | — | Planned | — |
| Agent | — | Planned | — |
| Code | — | Planned | — |
| Flow (if/switch/merge) | — | Planned | — |
| Schedule | — | Planned | — |

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
workers/auth-worker/.../nodes/<name>/
workers/web/.../nodes/<name>/
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

(Key fields liệt kê hoặc link tới default-nodes.ts)

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
4. Không sửa executor monolith — tạo plugin trong `nodes/<name>/`.
5. Giữ re-export ở path cũ cho đến hết migration.

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
