# Node: Webhook (`trigger:webhook` / `core:webhook`)

> **Trạng thái:** Done  
> **Spec chính:** [`workflow-node-plugin-spec.md`](../workflow-node-plugin-spec.md)  
> **Luồng vận hành:** [`workflow-how-it-works.md`](../workflow-how-it-works.md)

Webhook là **reference module** — registry schema, custom config panel, HTTP ingress, hai biến thể canvas (trigger vs core).

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **IDs** | `trigger:webhook`, `core:webhook` |
| **Category** | `trigger` / `core` |
| **Vai trò** | Nhận HTTP request → khởi chạy workflow |
| **Loại plugin** | Trigger (HTTP ingress) + canvas config UI; graph `skipExecution` |
| **Override kinds** | `TRIGGER_OVERRIDE_KINDS` / `CORE_OVERRIDE_KINDS` chứa `webhook` |

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

### Core variant (trong flow — UI placeholder)

```json
{
  "id": "node_xyz",
  "type": "core",
  "data": {
    "label": "Webhook",
    "coreKind": "webhook",
    "httpMethod": "POST",
    "webhookPath": "node_xyz"
  }
}
```

Core webhook **không** mở HTTP ingress riêng; runtime HTTP luôn qua D1 trigger + hook.

---

## 3. Handles

| Variant | Handle | Type | connectionType |
|---------|--------|------|----------------|
| `trigger:webhook` | `out` | source | main |
| `core:webhook` | `in` | target | main |
| `core:webhook` | `out` | source | main |

Khai báo trong `packages/workflow-nodes/src/nodes/webhook/definition.ts`.

---

## 4. node.data fields

| Field | Type | Default | Mô tả |
|-------|------|---------|-------|
| `triggerKind` / `coreKind` | string | `"webhook"` | Phân biệt variant |
| `httpMethod` | string | `"GET"` | GET, POST, PUT, DELETE |
| `webhookPath` | string | node id | Path segment URL production |
| `webhookAuth` | string | `"none"` | UI n8n-style; **runtime canonical dùng API token** |
| `webhookRespond` | string | `"immediately"` | `immediately`, `when_last_node`, … |
| `webhookTriggerMode` | string | `"workflow_active"` | Test listening |
| `webhookAuthBasicUser` / `Password` | string | — | UI only |
| `webhookAuthHeaderName` / `Value` | string | — | UI only |
| `webhookAuthJwtSecret` | string | — | UI only |
| `webhookOptions` | object | — | `allowed_origins`, `binary_field`, … |

---

## 5. Dual model — Canvas vs Runtime trigger

| Khía cạnh | Canvas webhook node | D1 `workflow_triggers` |
|-----------|--------------------|-----------------------|
| Mục đích | Config UI trên graph | HTTP entry point thật |
| Lưu trữ | `definition.nodes[].data` (UserDO) | Bảng `workflow_triggers` |
| URL production | Hiển thị trong config panel | `/hooks/workflows/:workflowId/:webhookPath` |
| Execute | `skipExecution` khi graph chạy | `runTrigger()` → full graph |

Save workflow **sync** webhook rows (`syncWebhookTriggersForWorkflow`). Path trên canvas (`webhookPath`) khớp segment URL.

**Auth production:** `X-Client-ID` (owner DO id) + `Authorization: Bearer utk_…` (permission `/hooks/workflows`). Không dùng token trong URL.

**Legacy:** `GET/POST /hooks/workflows/:ownerId/:token` vẫn mount.

---

## 6. File map (hiện tại)

```
packages/workflow-nodes/src/nodes/webhook/
├── definition.ts
├── schema.ts
└── output.ts

workers/auth-worker/.../workflows/nodes/webhook/
├── index.ts          # webhookTriggerPlugin, coreWebhookPlugin
├── trigger.ts        # handleWebhookRequest, handleWebhookRequestByWorkflowId
└── output.ts         # buildWebhookItemOutput

workers/web/.../build/workflows/_components/nodes/webhook/
├── index.ts          # webhookTriggerUIPlugin, coreWebhookUIPlugin
├── canvas.tsx
├── config-panel.tsx
├── defaults.ts
└── n8n-properties.ts
```

| File khác | Vai trò |
|-----------|---------|
| `api/hooks-presentation.ts` | Mount `/hooks/workflows/:workflowId/:path` + legacy |
| `api/presentation.ts` | `buildTriggerUrl()` |
| `triggers/triggers.ts` | D1 CRUD, `runTrigger`, sync on save |
| `triggers/webhook-auth.ts` | Validate API token |
| `triggers/webhook-notify.ts` | Broadcast kết quả test |
| `catalogs/workflow-trigger-catalog.ts` | Add-node (vẫn dùng) |

---

## 7. Backend

### 7.1 Trigger plugin

**Trigger type:** `webhook`

**Public URL:**

```
GET|POST /hooks/workflows/:workflowId/:webhookPath
Headers: X-Client-ID, Authorization: Bearer utk_…
```

Nhiều webhook trên một workflow bắt buộc `:webhookPath`. Không path + 1 webhook → OK.

**Handle:** `parseWebhookRequest` → `runTrigger` → `executeWorkflowGraph`. Output item: `buildWebhookItemOutput` (headers, query, body, files).

### 7.2 Auth

| Lớp | Hành vi |
|-----|---------|
| Production hook | API token (`validateWebhookApiToken`) |
| Canvas `webhookAuth` | Hiển thị UI; **chưa** thay thế API token |

### 7.3 Respond modes

| `webhookRespond` | Hành vi |
|------------------|---------|
| `immediately` | Trả JSON sớm; workflow có thể chạy tiếp |
| `when_last_node` | Đợi graph xong → `output` node cuối |
| `respond_node` / `streaming` | UI; runtime hạn chế |

---

## 8. Frontend

- Canvas: `nodes/webhook/canvas.tsx`
- Config: `WebhookNodeConfigPanel` — method, path, test/production URL, listening, mock output
- API: `listWorkflowTriggers` / `createWorkflowTrigger` trong `_lib/api.ts`
- Defaults: `triggerWebhookDefaults` / `coreWebhookDefaults`

Add-node vẫn `pickTrigger('webhook')` từ catalogs, không chỉ `addNode('trigger:webhook')`.

---

## 9. Registry schema

`TRIGGER_WEBHOOK_DEFINITION` / `CORE_WEBHOOK_DEFINITION` trong shared package.

---

## 10. Edge cases

1. Triggers panel có thể tạo webhook **không** có node trên canvas — vẫn hợp lệ.
2. Core webhook = placeholder; ingress luôn D1 + hook.
3. Binary PDF: `webhookOptions.binary_field` / body files → agent + save-rag `pdf-extract.ts`.
4. `/hooks/echo` — sink test HTTP Request node (cùng API token).

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.2 | 2026-09-11 | Done; URL `/:workflowId/:path` + API token; file map khớp repo |
| 0.1 | 2026-06-12 | Tách từ workflow-node-plugin-spec.md |
