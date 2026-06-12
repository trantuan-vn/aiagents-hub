# Node: Webhook (`trigger:webhook` / `core:webhook`)

> **Trạng thái:** In progress (Phase 1 — reference implementation)  
> **Spec chính:** [`workflow-node-plugin-spec.md`](../workflow-node-plugin-spec.md)  
> **Kiến trúc khung:** [`workflow-node-plugin-architecture.md`](../workflow-node-plugin-architecture.md)  
> **Luồng vận hành:** [`workflow-how-it-works.md`](../workflow-how-it-works.md)

Webhook là **node mẫu đầu tiên** — có đủ registry schema, custom config panel, external HTTP trigger, và hai biến thể trên canvas (trigger vs core).

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **IDs** | `trigger:webhook`, `core:webhook` |
| **Category** | `trigger` |
| **Vai trò** | Nhận HTTP request từ bên ngoài → khởi chạy workflow |
| **Loại plugin** | Trigger (HTTP ingress) + canvas config UI; execute pass-through |
| **Reference cho** | Mọi node có external trigger + custom config panel |

---

## 2. Graph representation

### Trigger variant (entry point)

```json
{
  "id": "node_abc",
  "type": "trigger",
  "position": { "x": 0, "y": 0 },
  "data": {
    "label": "Webhook",
    "triggerKind": "webhook",
    "httpMethod": "GET",
    "webhookPath": "node_abc",
    "webhookAuth": "none",
    "webhookRespond": "immediately",
    "webhookTriggerMode": "workflow_active"
  }
}
```

### Core variant (trong flow — UI placeholder, runtime hạn chế)

```json
{
  "id": "node_xyz",
  "type": "core",
  "data": {
    "label": "Webhook",
    "coreKind": "webhook",
    "httpMethod": "POST",
    "webhookPath": "node_xyz",
    "webhookAuth": "none",
    "webhookRespond": "immediately"
  }
}
```

---

## 3. Handles

| Variant | Handle | Type | connectionType |
|---------|--------|------|----------------|
| `trigger:webhook` | `out` | source | main |
| `core:webhook` | `in` | target | main |
| `core:webhook` | `out` | source | main |

---

## 4. node.data fields

| Field | Type | Default | Mô tả |
|-------|------|---------|-------|
| `triggerKind` / `coreKind` | string | `"webhook"` | Phân biệt variant |
| `httpMethod` | string | `"GET"` | GET, POST, PUT, PATCH, DELETE, … |
| `webhookPath` | string | node id | Path segment (UI); production URL dùng token |
| `webhookAuth` | string | `"none"` | `none`, `basic`, `header`, `jwt` |
| `webhookRespond` | string | `"immediately"` | `immediately`, `when_last_node`, `respond_node`, `streaming` |
| `webhookTriggerMode` | string | `"workflow_active"` | Chế độ lắng nghe test |
| `webhookAuthBasicUser` | string | — | Basic auth username |
| `webhookAuthBasicPassword` | string | — | Basic auth password |
| `webhookAuthHeaderName` | string | — | Header auth name |
| `webhookAuthHeaderValue` | string | — | Header auth value |
| `webhookAuthJwtSecret` | string | — | JWT secret |
| `webhookOptions` | object | — | `allowed_origins`, `binary_field`, `ignore_bots`, … |

---

## 5. Dual model — Canvas vs Runtime trigger

**Quan trọng:** Webhook có hai lớp dữ liệu tách biệt:

| Khía cạnh | Canvas webhook node | D1 `workflow_triggers` |
|-----------|--------------------|-----------------------|
| Mục đích | Config UI trên graph | HTTP entry point thật |
| Lưu trữ | `definition.nodes[].data` | Bảng `workflow_triggers` |
| URL production | Hiển thị trong config panel | `/hooks/workflows/:ownerId/:token` |
| Execute | Pass-through khi graph chạy | `runTrigger()` → full graph |

**Quy ước Phase 1:** Plugin webhook sở hữu cả hai — config panel đọc/ghi trigger qua workflow triggers API; `node.data` là mirror cho UX editor.

**Future:** Sync tự động canvas ↔ D1 khi save workflow.

---

## 6. File map

### Hiện tại (trước migration)

| File | Vai trò |
|------|---------|
| `workers/web/src/lib/workflow-node-registry/default-nodes.ts` | Registry entries `trigger:webhook`, `core:webhook` |
| `workers/auth-worker/src/features/admin/workflow-nodes/default-nodes.ts` | Mirror registry (duplicate) |
| `workers/web/src/lib/n8n-workflow/descriptions/webhook.ts` | n8n INodeProperties |
| `workers/web/src/lib/n8n-workflow/registry.ts` | Register `trigger:webhook`, `core:webhook` |
| `workers/web/.../panels/node-config/webhook-node-config-panel.tsx` | Custom config panel (~600 dòng) |
| `workers/web/.../panels/node-config/webhook-listening-panel.tsx` | Test listening UI |
| `workers/web/.../panels/node-config/webhook-edit-output-panel.tsx` | Edit mock output |
| `workers/web/.../panels/node-config/workflow-node-config-panel.tsx` | Router: `isWebhookNode()` → webhook panel |
| `workers/web/.../workflow-canvas.tsx` | `webhookNodeDefaults()` |
| `workers/web/.../catalogs/workflow-trigger-catalog.ts` | Add-node catalog entry |
| `workers/web/.../catalogs/workflow-core-catalog.ts` | Add-node catalog entry |
| `workers/web/.../workflow-add-node-panel.tsx` | `pickTrigger("webhook")`, `pickCoreItem(webhook)` |
| `workers/web/.../nodes/workflow-nodes.tsx` | `TriggerNode` canvas component |
| `workers/web/.../workflow-triggers-panel.tsx` | Tạo/list trigger + hiển thị webhook URL |
| `workers/auth-worker/.../triggers.ts` | D1 CRUD, `runTrigger()`, token lookup |
| `workers/auth-worker/.../hooks-presentation.ts` | Public `POST/GET /hooks/workflows/:ownerId/:token` |
| `workers/auth-worker/.../presentation.ts` | `buildTriggerUrl()`, enrich trigger response |
| `workers/auth-worker/.../executor.ts` | `case 'trigger'`: pass-through (không logic webhook riêng) |

### Mục tiêu (sau Phase 1 migration)

```
packages/workflow-nodes/src/nodes/webhook/     # Phase 2
├── definition.ts                              # trigger:webhook + core:webhook
└── schema.ts

workers/auth-worker/src/features/member/workflows/nodes/webhook/
├── index.ts                                   # register plugin(s)
├── trigger.ts                                 # create / handle / delete
└── respond.ts                                 # future: respond-to-webhook

workers/web/.../build/workflows/_components/nodes/webhook/
├── index.ts                                   # webhookPlugin, coreWebhookPlugin
├── canvas.tsx
├── config-panel.tsx                           # move từ webhook-node-config-panel.tsx
├── listening-panel.tsx
├── edit-output-panel.tsx
├── defaults.ts                                # move từ workflow-canvas.tsx
└── n8n-properties.ts                          # move từ lib/n8n-workflow/descriptions/
```

**Re-export shims (giữ backward compat):**

```typescript
// panels/node-config/webhook-node-config-panel.tsx
export { WebhookNodeConfigPanel, isWebhookNode } from '../../nodes/webhook/config-panel';
```

---

## 7. Backend

### 7.1 Trigger plugin (`trigger.ts`)

**Trigger type:** `webhook`

**Tạo trigger:**

- API: `POST /dashboard/build/workflows/:id/triggers` body `{ type: "webhook" }`
- Code: `workers/auth-worker/.../triggers.ts` → `createWorkflowTrigger()`
- Sinh `webhookToken`, lưu D1 `workflow_triggers`

**Public URL:**

```
/hooks/workflows/:ownerId/:webhookToken
```

- Route: `hooks-presentation.ts` (mounted tại `/hooks`)
- Build URL: `presentation.ts` → `buildTriggerUrl()`

**Handle request:**

1. Lookup trigger by `ownerId` + `token`
2. Parse body / query / headers → `TriggerInput`
3. Gọi `runTrigger()` → `executeWorkflowGraph()`

**Execute trên graph (trigger node):**

```typescript
// executor.ts — case 'trigger'
return { ...ctx.runContext, triggeredAt: Date.now(), text: ctx.input ?? '', data: nodeInput.data };
```

Webhook node trên canvas **không** parse HTTP — chỉ pass-through khi workflow đã được trigger từ bên ngoài.

### 7.2 Auth (canvas config — chưa enforce đầy đủ runtime)

| `webhookAuth` | Hành vi mong muốn |
|---------------|-------------------|
| `none` | Không verify |
| `basic` | Verify Authorization: Basic |
| `header` | Verify custom header |
| `jwt` | Verify JWT signature |

> **Note hiện tại:** Một số auth options mới có UI; runtime enforcement cần implement trong `trigger.ts` khi migrate.

### 7.3 Respond modes

| `webhookRespond` | Hành vi |
|------------------|---------|
| `immediately` | Trả response ngay, workflow chạy async |
| `when_last_node` | Đợi workflow xong → trả output node cuối |
| `respond_node` | Node `respond_to_webhook` trả response |
| `streaming` | Stream response (future) |

---

## 8. Frontend

### 8.1 Canvas

- **Trigger:** `TriggerNode` trong `workflow-nodes.tsx` — handle `out` only
- **Core:** `CoreNode` / simple node — handles `in` + `out`
- Sau migration: tách vào `nodes/webhook/canvas.tsx` (có thể export 2 wrapper hoặc 1 component parameterized)

### 8.2 Config panel (custom — không dùng generic)

Detect node:

```typescript
export function isWebhookNode(node: GraphNode): boolean {
  return (
    (node.type === 'trigger' && node.data?.triggerKind === 'webhook') ||
    (node.type === 'core' && node.data?.coreKind === 'webhook')
  );
}
```

Panel features:

- HTTP method selector
- Test URL / Production URL (fetch từ `listWorkflowTriggers`)
- Authentication settings
- Respond mode radio
- Options (allowed origins, binary field, ignore bots)
- Listening mode (test webhook)
- Edit output (mock data cho development)

**API client:** `workers/web/.../build/workflows/_lib/api.ts`

- `listWorkflowTriggers(workflowId)`
- `createWorkflowTrigger(workflowId, { type: 'webhook' })`

### 8.3 Defaults

```typescript
// nodes/webhook/defaults.ts
export function webhookNodeDefaults(
  id: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const isWebhook =
    extra?.coreKind === 'webhook' || extra?.triggerKind === 'webhook';
  if (!isWebhook) return {};
  const path = String(extra?.webhookPath ?? '').trim();
  return {
    httpMethod: 'GET',
    webhookPath: path || id,
    webhookAuth: 'none',
    webhookRespond: 'immediately',
    webhookTriggerMode: 'workflow_active',
  };
}
```

### 8.4 Add node

**Hiện tại:**

```typescript
// workflow-add-node-panel.tsx
pickTrigger('webhook', ...)   // → type: 'trigger', { triggerKind: 'webhook' }
pickCoreItem(webhookItem)     // → type: 'core', { coreKind: 'webhook' }
```

**Sau refactor:**

```typescript
addNode('trigger:webhook')    // hoặc addNode('core:webhook')
```

### 8.5 Catalog metadata

```typescript
// nodes/webhook/index.ts
export const webhookTriggerPlugin: WorkflowNodeUIPlugin = {
  id: 'trigger:webhook',
  runtimeType: 'trigger',
  kind: 'webhook',
  catalog: {
    category: 'trigger',
    labelKey: 'trigger_kind_webhook',
    descriptionKey: 'trigger_kind_webhook_desc',
    icon: 'Webhook',
  },
  match: (node) => node.type === 'trigger' && node.data?.triggerKind === 'webhook',
  // Canvas, ConfigPanel, defaults, n8nProperties ...
};
```

---

## 9. Registry schema

Hai entries trong `default-nodes.ts`:

- `trigger:webhook` — `runtimeType: "trigger"`, `kind: "webhook"`
- `core:webhook` — `runtimeType: "core"`, `kind: "webhook"`

**Parameters section (chung):**

| Field id | Type | labelKey |
|----------|------|----------|
| `httpMethod` | select | `http_method` |
| `webhookPath` | text | `webhook_path` |
| `webhookAuth` | select | `webhook_authentication` |
| `webhookRespond` | select | `webhook_respond` |

---

## 10. i18n keys

Namespace: `WorkflowNodeRegistry`, `WorkflowEditorPage`

| Key | Mục đích |
|-----|----------|
| `trigger_kind_webhook` | Tên trigger variant |
| `trigger_kind_webhook_desc` | Mô tả trigger |
| `core_kind_webhook` | Tên core variant |
| `core_kind_webhook_desc` | Mô tả core |
| `webhook_path` | Path field |
| `webhook_authentication` | Auth selector |
| `webhook_auth_none` / `basic` / `header` / `jwt` | Auth options |
| `webhook_respond` | Respond mode |
| `webhook_respond_immediately` / `_last_node` / `_node` / `_streaming` | Respond options |
| `webhook_listening_title` | Test listening UI |
| `webhook_stop_listening` | Stop test |
| `triggers_add_webhook` | Triggers panel button |

Files: `workers/web/messages/en-US.json`, `workers/web/messages/vi-VN.json`

---

## 11. Checklist triển khai Phase 1

### Backend

- [ ] Tạo `workflows/nodes/webhook/index.ts`
- [ ] Move trigger logic từ `triggers.ts` / `hooks-presentation.ts` → `trigger.ts` (delegate, không breaking routes)
- [ ] Register plugin trong `workflows/nodes/index.ts`
- [ ] (Optional) `respond.ts` stub cho respond modes

### Frontend

- [ ] Tạo `nodes/webhook/` folder
- [ ] Move `webhook-node-config-panel.tsx` → `config-panel.tsx`
- [ ] Move `webhook-listening-panel.tsx`, `webhook-edit-output-panel.tsx`
- [ ] Move `webhookNodeDefaults()` → `defaults.ts`
- [ ] Move n8n properties → `n8n-properties.ts`
- [ ] Tạo `index.ts` với `webhookTriggerPlugin`, `coreWebhookPlugin`
- [ ] Register trong `nodes/index.ts`
- [ ] Re-export shims ở path cũ
- [ ] Cập nhật `workflow-node-config-panel.tsx` import từ `nodes/webhook`

### Docs & verify

- [ ] Manual test: add trigger webhook → mở config → tạo trigger → copy URL → POST → workflow chạy
- [ ] Manual test: add core webhook → config panel mở đúng
- [ ] Không breaking existing imports

---

## 12. Hướng dẫn Cursor

### Khi implement / refactor webhook node

1. Đọc [`workflow-node-plugin-architecture.md`](../workflow-node-plugin-architecture.md) — hiểu khung plugin.
2. Đọc spec này — hiểu dual model canvas vs D1 trigger.
3. **Không** thêm case webhook vào `executor.ts` monolith — logic HTTP ingress thuộc `nodes/webhook/trigger.ts`.
4. **Không** xóa route `/hooks/workflows/...` — chỉ delegate implementation.
5. Giữ **re-export shims** tại path cũ cho đến hết migration.
6. Custom config panel giữ nguyên UX — chỉ move file, không redesign.
7. Config panel phải tiếp tục gọi `listWorkflowTriggers` / `createWorkflowTrigger` cho production URL.

### Prompt gợi ý

```
Implement Phase 1 webhook node module theo:
- docs/workflow-node-plugin-architecture.md
- docs/workflow-nodes/webhook.md

Tạo nodes/webhook/ trên backend (auth-worker) và frontend (web).
Move code hiện có, giữ backward-compatible re-exports.
Không refactor executor monolith hay shared package trong task này.
```

### Prompt gợi ý — node mới (không phải webhook)

```
Implement node <name> theo docs/workflow-nodes/<name>.md
và kiến trúc docs/workflow-node-plugin-architecture.md.
Copy cấu trúc từ webhook node (docs/workflow-nodes/webhook.md)
nhưng chỉ lấy các phần phù hợp (execute / trigger / custom panel).
```

### Anti-patterns (tránh)

- ❌ Gộp logic webhook HTTP vào canvas node execute
- ❌ Hardcode webhook URL trong frontend (phải lấy từ triggers API)
- ❌ Sửa `catalogs/*.ts` thay vì plugin `catalog` metadata (sau Phase 4)
- ❌ Duplicate registry schema — chuẩn bị move sang shared package Phase 2

---

## 13. Tests

| Test | Mô tả | File đích |
|------|-------|-----------|
| Trigger lookup | Token hợp lệ/không hợp lệ | `nodes/webhook/trigger.test.ts` |
| Handle POST | Body JSON → TriggerInput | `nodes/webhook/trigger.test.ts` |
| isWebhookNode | Detect đúng trigger/core variant | `nodes/webhook/config-panel.test.tsx` |
| Defaults | Seed data khi add node | `nodes/webhook/defaults.test.ts` |
| E2E | Add webhook → trigger → execute | e2e suite |

---

## 14. Edge cases & notes

1. **Triggers panel vs canvas node:** User có thể tạo webhook trigger từ Triggers panel mà không có webhook node trên canvas — hai cách entry đều hợp lệ.
2. **Core webhook:** Chủ yếu UI/placeholder; runtime HTTP ingress luôn qua D1 trigger + public hook.
3. **Auth enforcement:** UI đã có options; runtime verify cần bổ sung trong `trigger.ts`.
4. **Respond modes:** Chỉ `immediately` và partial `when_last_node` có thể đã hoạt động — verify trước khi document cho user.
5. **Workflow active mode:** Test listening có thể cần workflow ở trạng thái active — document trong UI.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-12 | Tách từ workflow-node-plugin-spec.md; bổ sung file map hiện tại + hướng dẫn Cursor |
