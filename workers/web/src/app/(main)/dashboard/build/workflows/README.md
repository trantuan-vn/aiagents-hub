# Workflow — Kiến trúc & Hướng dẫn bảo trì

Tài liệu mô tả giải pháp workflow của AIAgentsHub: builder (React Flow), **Node Registry** (schema-driven tĩnh trên frontend), và API backend.

## Tổng quan

| Khu vực | Route | Vai trò |
|---------|-------|---------|
| **Workflow Builder** | `/dashboard/build/workflows` | Soạn thảo graph, chạy workflow, chat agent |
| **Service Management** | `/dashboard/workflow/services` | Admin CRUD dịch vụ API |
| **Node Registry** | `lib/workflow-node-registry` | Schema built-in cho config panel (frontend) |

```mermaid
flowchart LR
  subgraph Builder
    D["Workflow Editor"]
    E["Node Config Panel\n3 cột"]
  end
  subgraph Lib
    F["lib/workflow-node-registry\ndefault-nodes.ts"]
  end
  F --> D
  D --> E
```

## Node Registry — Mô hình dữ liệu

Mỗi node trong registry có **3 phần** (theo phong cách n8n):

| Phần | `section.id` | Mục đích |
|------|--------------|----------|
| **Input** | `input` | Dữ liệu upstream, biến ngữ cảnh (`$now`, `$vars`, `$execution`, …) |
| **Parameters** | `parameters` | Cấu hình hành vi node (prompt, HTTP URL, toggle, …) |
| **Output** | `output` | Kết quả sau execute, mock data, nút Execute step |

### Loại trường (`WorkflowNodeFieldType`)

| Type | Mô tả |
|------|--------|
| `text` | Input một dòng |
| `textarea` | Văn bản nhiều dòng |
| `select` | Dropdown (có `options`) |
| `toggle` | Bật/tắt |
| `number` | Số |
| `json` | JSON editor |
| `expression` | Biểu thức (hỗ trợ `fx`) |
| `info` | Chỉ hiển thị, không nhập |
| `options-group` | Nhóm tham số tuỳ chọn |
| `resource-link` | Liên kết resource trên canvas (service / memory / tools) |

### Node built-in

- **Built-in** (`isBuiltin: true`): node mặc định (agent, trigger, flow, core, …) định nghĩa trong `default-nodes.ts`.

Schema TypeScript: `workers/web/src/lib/workflow-node-registry/types.ts`

Defaults: `workers/web/src/lib/workflow-node-registry/default-nodes.ts`

**Agent node** có schema đầy đủ (prompt source, prompt fx, toggles, Chat Model / Memory / Tools) — tham chiếu layout n8n AI Agent.

## Workflow Builder

### Cấu trúc thư mục `_components/`

```
_components/
├── catalogs/          # Danh mục add-node (core, flow, trigger, tool, memory, …)
│   └── index.ts
├── nodes/             # React Flow node components
│   ├── workflow-nodes.tsx
│   └── workflow-sticky-note-node.tsx
├── hooks/             # State, undo, collab, node registry
│   ├── use-workflow-canvas-state.ts
│   └── use-workflow-node-registry.ts
├── panels/
│   └── node-config/   # Panel cấu hình 3 cột
│       ├── workflow-node-config-panel.tsx
│       ├── node-config-io-panel.tsx
│       └── node-config-field-renderer.tsx
└── workflow-*.ts(x)   # Canvas, editor shell, edges, layout, …
```

Các file re-export ở root `_components/` (vd. `workflow-nodes.tsx` → `./nodes/workflow-nodes`) giữ **tương thích import cũ**.

### Node Config Panel (editor)

Khi user **double-click** node hoặc chọn menu **Open** trên node toolbar:

- **Trái:** INPUT (Schema / Table / JSON)
- **Giữa:** Parameters + Settings, nút **Execute step**
- **Phải:** OUTPUT

Panel đọc schema từ `useWorkflowNodeRegistry()` → `resolveNodeDefinition(runtimeType, kind)`.

File chính: `panels/node-config/workflow-node-config-panel.tsx`  
Tích hợp trong: `workflow-canvas.tsx`.

### Runtime vs UI catalog

| Lớp | Nguồn |
|-----|--------|
| **Executor** (`auth-worker`) | `node.type` + một số field trong `node.data` |
| **Registry / Config panel** | Schema từ Node Registry |
| **Add-node drawer** | `catalogs/*` (hardcoded, chưa đồng bộ 100% với registry) |

> **Lưu ý:** Một số sub-kind UI (vd. `coreKind: "http_request"` trên `type: "core"`) có thể khác `runtimeType` executor (`http_request`). Khi mở rộng, ưu tiên align `runtimeType` + `kind` trong registry.

## Thư viện dùng chung (frontend)

```
workers/web/src/lib/workflow-node-registry/
├── types.ts
├── default-sections.ts
├── default-nodes.ts
└── index.ts
```

Hook: `hooks/use-workflow-node-registry.ts` (đọc `DEFAULT_WORKFLOW_NODE_REGISTRY`).

## Lưu workflow (graph)

Workflow graph **không** lưu trong Node Registry. Mỗi workflow lưu JSON `definition` trên bảng `agent_workflows`:

```json
{
  "nodes": [{ "id", "type", "position", "data": {} }],
  "edges": [{ "id", "source", "target" }]
}
```

Node types hợp lệ (Zod): `workers/auth-worker/src/features/member/workflows/domain.ts` → `WorkflowNodeTypeSchema`.

## Hướng dẫn mở rộng

### Thêm trường cho node built-in

1. Bổ sung field trong `default-nodes.ts`.
2. Thêm key i18n vào `messages/en-US.json` và `vi-VN.json` (namespace `WorkflowNodeRegistry`).

### Thêm node built-in mới

1. Bổ sung entry trong `default-nodes.ts`.
2. Thêm `WorkflowNodeTypeSchema` nếu là type executor mới.
3. Implement case trong `executor.ts`.
4. Thêm i18n + component canvas nếu cần.

## Deploy

- `workers/web` — Workflow Builder + Node Config Panel
- `workers/auth-worker` — Workflow API (graph CRUD, execute)

## Roadmap gợi ý

- [ ] **Node Plugin Architecture** — [`docs/workflow-node-plugin-spec.md`](../../../../../../../../docs/workflow-node-plugin-spec.md) (spec) · [`docs/workflow-nodes/webhook.md`](../../../../../../../../docs/workflow-nodes/webhook.md) (webhook mẫu)
- [ ] Đồng bộ add-node drawer (`catalogs/`) với Node Registry
- [ ] Execute step thật theo từng node (hiện mới có UI)
- [ ] Align `coreKind` / `flowKind` UI với `runtimeType` executor
- [ ] Gói shared types vào `packages/workflow-nodes`

## Liên quan

| Thành phần | Đường dẫn |
|------------|-----------|
| **Node Plugin — Spec** | [`docs/workflow-node-plugin-spec.md`](../../../../../../../../docs/workflow-node-plugin-spec.md) |
| **Luồng vận hành từng bước** | [`docs/workflow-how-it-works.md`](../../../../../../../../docs/workflow-how-it-works.md) |
| **Node Plugin — kiến trúc khung** | [`docs/workflow-node-plugin-architecture.md`](../../../../../../../../docs/workflow-node-plugin-architecture.md) |
| **Node Plugin — webhook (mẫu)** | [`docs/workflow-nodes/webhook.md`](../../../../../../../../docs/workflow-nodes/webhook.md) |
| **Node specs index** | [`docs/workflow-nodes/README.md`](../../../../../../../../docs/workflow-nodes/README.md) |
| Workflow API (graph CRUD, execute) | `workers/auth-worker/src/features/member/workflows/` |
| Service management (CRUD) | `/dashboard/workflow/services` |
