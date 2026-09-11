# Workflow Node Plugin — Kiến trúc khung

> **Trạng thái:** Implemented (còn việc catalog dual-write)  
> **Phiên bản:** 0.3  
> **Ngày:** 2026-09-11  
> **Phạm vi:** Backend (`auth-worker`), Frontend (`web`), Shared package (`packages/workflow-nodes`)

Tài liệu **rút gọn** kiến trúc khung. **Spec chính đầy đủ:** [`workflow-node-plugin-spec.md`](./workflow-node-plugin-spec.md).

**Liên quan:**

| Tài liệu | Đường dẫn |
|----------|-----------|
| **Spec chính** | [`workflow-node-plugin-spec.md`](./workflow-node-plugin-spec.md) |
| **Kiến trúc tổng thể** | [`workflow-architecture.md`](./workflow-architecture.md) |
| Kiến trúc workflow hiện tại | [`workers/web/.../workflows/README.md`](../workers/web/src/app/(main)/dashboard/build/workflows/README.md) |
| **Luồng vận hành từng bước** | [`workflow-how-it-works.md`](./workflow-how-it-works.md) |
| Spec từng node | [`docs/workflow-nodes/`](./workflow-nodes/README.md) |
| Workflow API | `workers/auth-worker/src/features/member/workflows/` ([README](../workers/auth-worker/src/features/member/workflows/README.md)) |
| Node Registry (frontend) | `workers/web/src/lib/workflow-node-registry/` |

---

## 1. Mục tiêu

### 1.1 Đã làm / còn lại

Plugin layout **đã chạy**. Executor không còn switch-case.

| Lớp | Hiện tại | Còn lại |
|-----|----------|---------|
| Executor | `engine/executor.ts` → `nodePluginRegistry.resolve` | — |
| Schema / Registry | `@aiagents-hub/workflow-nodes`; `default-nodes.ts` là shim | — |
| Add-node catalog | `catalogs/*.ts` **vẫn** drive drawer | `NODE_CATALOG` từ UI plugins chưa thay catalogs |
| Canvas UI | `nodes/<name>/canvas.tsx`; `workflow-nodes.tsx` shim | FE không có folder `http-request/` / `code/` (factory `core`) |
| Config panel | Router + custom `ConfigPanel` trên plugin | Generic đủ cho hầu hết kind |
| Trigger / Hook | `nodes/webhook/trigger.ts` + `triggers/` orchestrator | Canvas `webhookAuth` ≠ production API token |
| Connection rules | Shared `connection-rules.ts` + FE/BE helpers | `handles[]` mới khai báo đầy đủ trên webhook |

**Thêm node mới:** shared definition + BE plugin + FE plugin (xem §7). Add-node item vẫn cần `catalogs/*.ts` cho đến khi drawer chuyển sang `NODE_CATALOG`.

### 1.2 Mục tiêu thiết kế

1. **Một node = một module** — schema, runtime, canvas, config, trigger (nếu có) cùng namespace.
2. **Single source of truth** — schema/defaults trong shared package; catalog sinh từ registry.
3. **Engine tách khỏi node** — traversal, scheduling, edge validation là infrastructure.
4. **Spec per node** — mỗi node có file `.md` riêng trong `docs/workflow-nodes/` để hướng dẫn Cursor.
5. **Migration incremental** — giữ backward-compatible re-exports.

### 1.3 Non-goals

- Đổi format JSON graph (`WorkflowDefinition`).
- Third-party node plugins từ npm.
- Xóa `catalogs/*.ts` trước khi add-node đọc `NODE_CATALOG`.

---

## 2. Tổng quan kiến trúc

```mermaid
flowchart TB
  subgraph Docs["docs/workflow-nodes/"]
    Arch["architecture.md\n(khung)"]
    WH["webhook.md"]
    Future["<node>.md ..."]
  end

  subgraph Shared["packages/workflow-nodes"]
    Def["definitions + handles"]
    Conn["connection rules"]
  end

  subgraph Backend["auth-worker / workflows"]
    Engine["engine/"]
    NodeReg["nodes/index.ts"]
    NodeBE["nodes/<name>/"]
    Engine --> NodeReg --> NodeBE
  end

  subgraph Frontend["web / build/workflows"]
    CanvasEng["engine/"]
    NodeUI["nodes/index.ts"]
    NodeFE["nodes/<name>/"]
    CanvasEng --> NodeUI --> NodeFE
  end

  Arch --> NodeBE
  WH --> NodeBE
  Def --> NodeReg
  Def --> NodeUI
  Conn --> Engine
  Conn --> CanvasEng
```

### 2.1 Ba tầng

| Tầng | Trách nhiệm | Không làm |
|------|-------------|-----------|
| **Shared** | Types, Zod schema, defaults, handles, connection rules | Import React, Workers, KV/D1 |
| **Engine** | Graph CRUD, traversal, scheduling, billing, collab | Logic nghiệp vụ từng node |
| **Node Plugin** | Execute, trigger, canvas, config, catalog | Tự implement edge traversal |

### 2.2 Tài liệu theo node

```
docs/
├── workflow-node-plugin-architecture.md   ← file này (khung)
└── workflow-nodes/
    ├── README.md                          ← index + template spec node mới
    └── webhook.md                         ← spec node webhook (reference)
    └── <tên-node>.md                      ← thêm khi phát triển node mới
```

**Quy ước:** Trước khi code node mới, tạo hoặc cập nhật `docs/workflow-nodes/<tên-node>.md` theo template trong [`workflow-nodes/README.md`](./workflow-nodes/README.md).

---

## 3. Shared Package — `packages/workflow-nodes`

### 3.1 Cấu trúc thư mục

```
packages/workflow-nodes/          # @aiagents-hub/workflow-nodes
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types/                    # node-definition, graph, handles, connection-rules
    ├── registry/                 # merge.ts, resolve.ts
    ├── catalog/                  # WORKFLOW_NODE_CATALOG_SEEDS (admin active flags)
    └── nodes/
        ├── builtins.ts
        ├── create-builtin.ts
        ├── workflow-presets.ts
        └── <family>/
            ├── definition.ts
            ├── kinds.ts          # hoặc channels.ts (human_review)
            └── schema.ts         # optional (webhook)
```

### 3.2 Node Definition

```typescript
export interface WorkflowNodeDefinition {
  id: string;                         // "trigger:webhook" | "agent"
  runtimeType: WorkflowNodeType;
  kind?: string;
  category: NodeCategory;
  nameKey: string;
  isBuiltin: true;
  isActive: boolean;
  sections: NodeSection[];            // input | parameters | output
  defaultData?: Record<string, unknown>;
  handles?: HandleDefinition[];
}

export interface HandleDefinition {
  id: string;
  type: 'source' | 'target';
  connectionType: 'main' | 'branch' | 'resource';
  maxConnections?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
}
```

### 3.3 Connection Rules

Quy tắc kết nối **tập trung**, không nằm trong từng node plugin:

```typescript
export function isValidWorkflowConnection(
  sourceNode: GraphNode,
  sourceHandle: string | null,
  targetNode: GraphNode,
  targetHandle: string | null,
  definitions: Map<string, WorkflowNodeDefinition>,
): boolean;
```

Node plugin chỉ **khai báo handles**; engine validate và render.

---

## 4. Backend — Node Plugin System

### 4.1 Cấu trúc thư mục

```
workers/auth-worker/src/features/member/workflows/
├── api/
│   ├── presentation.ts
│   ├── hooks-presentation.ts       # /hooks/workflows/:workflowId/:path + channels
│   └── form-hooks-presentation.ts  # /form, /form-test
├── domain/
├── execution/
├── engine/                         # executor, graph/flow/loop helpers, HITL, persist
├── nodes/
│   ├── index.ts                    # BUILTIN_PLUGINS + Registry
│   ├── types.ts
│   └── <name>/                     # family, factory kinds, hoặc override
├── triggers/                       # D1 rows, cron, form-trigger-runner, webhook-auth
├── rag/                            # Vectorize embed / query / upsert
├── billing/, collab/, storage/, integrations/
└── README.md
```

### 4.2 Plugin Contract

```typescript
export interface WorkflowNodePlugin {
  id: string;
  runtimeType: WorkflowNodeType;
  kind?: string;
  dataSchema?: z.ZodType;
  execute?: (ctx: NodeContext) => Promise<NodeOutput>;
  trigger?: {
    type: string;
    create: (opts: CreateTriggerOpts) => Promise<TriggerRecord>;
    handle: (req: Request, trigger: TriggerRecord) => Promise<TriggerInput>;
    delete?: (trigger: TriggerRecord) => Promise<void>;
  };
  skipExecution?: boolean;
}
```

### 4.3 Executor Dispatch

```typescript
async function executeNodeLogic(node, nodeInput, ctx, onCost) {
  const plugin = nodeRegistry.resolve(node);
  if (!plugin) throw new Error(`Unknown node type: ${node.type}`);
  if (plugin.skipExecution) return nodeInput;
  if (!plugin.execute) throw new Error(`Node ${plugin.id} has no execute handler`);
  return plugin.execute({ node, nodeInput, ...ctx, onCost });
}
```

### 4.4 Trigger Routing

```typescript
const plugin = nodeRegistry.findByTriggerType(trigger.type);
return plugin.trigger.handle(request, trigger);
```

---

## 5. Frontend — Node UI Plugin System

### 5.1 Cấu trúc thư mục

```
workers/web/src/app/(main)/dashboard/build/workflows/
├── _components/
│   ├── canvas/                     # workflow-canvas, controls, theme
│   ├── editor/                     # shell, header, sidebar
│   ├── add-node/                   # drawer, panel
│   ├── edges/                      # edges, handles, connection utils
│   ├── layout/                     # definition, placement
│   ├── nodes/
│   │   ├── index.ts                # workflowNodeTypes + NODE_CATALOG
│   │   ├── types.ts
│   │   ├── _template/README.md
│   │   └── <name>/
│   │       ├── index.ts
│   │       ├── canvas.tsx
│   │       ├── config-panel.tsx    # optional
│   │       ├── defaults.ts
│   │       └── n8n-properties.ts   # optional
│   ├── panels/
│   │   ├── node-config/
│   │   │   ├── workflow-node-config-panel.tsx   # router
│   │   │   └── generic-config-panel.tsx
│   │   └── workflow-panels/
│   ├── catalogs/                   # add-node drawer (vẫn dùng)
│   ├── hooks/
│   └── engine/                     # re-exports edges & layout
└── _lib/
```

**Hai catalog:** `catalogs/*.ts` vẫn là nguồn add-node drawer. `NODE_CATALOG` sinh từ UI plugins nhưng **chưa** được add-node dùng. Admin active/inactive: `packages/workflow-nodes/src/catalog/entries.ts`.

### 5.2 Plugin Contract

```typescript
export interface WorkflowNodeUIPlugin {
  id: string;
  runtimeType: string;
  kind?: string;
  Canvas: ComponentType<NodeProps>;
  ConfigPanel?: ComponentType<NodeConfigPanelProps>;
  defaults?: () => Record<string, unknown>;
  catalog: {
    category: 'trigger' | 'core' | 'flow' | 'tool' | 'memory' | 'transform';
    labelKey: string;
    descriptionKey?: string;
    icon?: string;
    keywords?: string[];
    visible?: boolean;
  };
  n8nProperties?: INodeProperties[];
  match?: (node: GraphNode) => boolean;
}
```

### 5.3 Registry & Config Router

```typescript
// nodes/index.ts
export const BUILTIN_UI_PLUGINS: WorkflowNodeUIPlugin[] = [/* ... */];
export const NODE_CATALOG = groupBy(plugins, p => p.catalog.category);

// config panel router
const plugin = resolveUIPlugin(selectedNode);
if (plugin?.ConfigPanel) return <plugin.ConfigPanel ... />;
return <GenericConfigPanel ... />;
```

### 5.4 Add Node Flow

```
Catalog pick → resolveUIPlugin(id) → createNode({ type, data: defaults() }) → canvas
```

---

## 6. Quy tắc đặt tên & ID

### 6.1 Node ID

| Pattern | Ví dụ |
|---------|-------|
| `{runtimeType}` | `agent`, `flow` |
| `{runtimeType}:{kind}` | `trigger:webhook`, `core:http_request` |

### 6.2 Kind keys trong `node.data`

| runtimeType | Kind field | Ví dụ |
|-------------|------------|-------|
| `trigger` | `triggerKind` | `webhook`, `schedule` |
| `core` | `coreKind` | `http_request`, `code` |
| `flow` | `flowKind` | `if`, `switch`, `merge` |

**Chuẩn hóa (Phase 5):** Ưu tiên `node.type === runtimeType`, hạn chế `type: "core" + coreKind`.

### 6.3 File naming

| Loại | Pattern |
|------|---------|
| Plugin entry | `index.ts` |
| Execute | `execute.ts` |
| Trigger | `trigger.ts` |
| Canvas | `canvas.tsx` |
| Config | `config-panel.tsx` |
| Defaults | `defaults.ts` |
| n8n props | `n8n-properties.ts` |
| Spec doc | `docs/workflow-nodes/<name>.md` |

---

## 7. Checklist chung — Thêm node mới

> Chi tiết từng node: xem spec riêng trong `docs/workflow-nodes/<name>.md`.

### 7.1 Tài liệu

- [ ] Tạo `docs/workflow-nodes/<name>.md` theo template
- [ ] Cập nhật index trong `docs/workflow-nodes/README.md`

### 7.2 Shared package

- [ ] `packages/workflow-nodes/src/nodes/<name>/definition.ts`
- [ ] `kinds.ts` nếu family có nhiều variant
- [ ] Export + `builtins.ts` / catalog seed nếu cần

### 7.3 Backend

- [ ] `nodes/<name>/execute.ts` (nếu executable)
- [ ] `nodes/<name>/trigger.ts` (nếu external trigger)
- [ ] Register trong `nodes/index.ts` (override last)

### 7.4 Frontend

- [ ] `nodes/<name>/canvas.tsx`
- [ ] `nodes/<name>/defaults.ts`
- [ ] `nodes/<name>/config-panel.tsx` (nếu generic không đủ)
- [ ] Register trong `nodes/index.ts`
- [ ] Add-node: `catalogs/*.ts` (drawer chưa đọc `NODE_CATALOG`)
- [ ] i18n keys

### 7.5 Verify

- [ ] Add từ catalog → canvas OK
- [ ] Config panel OK
- [ ] Edge validation OK
- [ ] Execute workflow OK
- [ ] Trigger endpoint OK (nếu có)

---

## 8. Lộ trình Migration

| Phase | Mục tiêu | Trạng thái |
|-------|----------|------------|
| **1** | Webhook module | **Done** — `nodes/webhook/` BE + FE |
| **2** | Shared package `@aiagents-hub/workflow-nodes` | **Done** |
| **3** | Backend plugin registry + `engine/` | **Done** — không còn switch-case |
| **4** | Frontend plugin + auto catalog | **Partial** — UI plugins xong; add-node vẫn `catalogs/*.ts` |
| **5** | Align `runtimeType` trên graph | **Partial** — `http_request`/`code` vừa first-class vừa `coreKind` |

---

## 9. Backward Compatibility

1. Re-export shims ở path cũ (`workflow-nodes.tsx` → `./nodes`).
2. Không breaking imports cho đến Phase 4 xong.
3. Graph JSON không đổi format.
4. Admin KV merge logic giữ nguyên.

---

## 10. Testing Strategy

| Layer | Test | Vị trí |
|-------|------|--------|
| Shared | schema, connection rules | `packages/workflow-nodes/**/*.test.ts` |
| Backend | execute per plugin | `nodes/<name>/execute.test.ts` |
| Backend | trigger integration | `nodes/<name>/trigger.test.ts` |
| Frontend | canvas, config panel | Vitest + RTL |
| E2E | add → connect → execute | e2e suite |

---

## 11. Open Questions

| # | Câu hỏi | Đề xuất |
|---|---------|---------|
| 1 | `execution/node-runtime.ts` shared hay per-node? | Shared cho HTTP/code helpers |
| 2 | Một `runtimeType` nhiều Canvas? | Một component, handles dynamic theo kind |
| 3 | Admin custom nodes cần plugin folder? | Không — generic canvas + panel |
| 4 | Package name? | `@aiagents-hub/workflow-nodes` |

---

## 12. So sánh Before / After

| Hành động | Before | After |
|-----------|--------|-------|
| Thêm node | ~12 files, 4+ dirs | ~4–6 files, 1 dir + 1 spec `.md` |
| Hướng dẫn Cursor | Không có | `docs/workflow-nodes/<name>.md` |
| Tìm code node | Grep repo | `nodes/<name>/` |
| Catalog | Sửa `catalogs/*.ts` | `catalog` trong plugin |
| Executor | Switch-case | Registry dispatch |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.3 | 2026-09-11 | Đánh dấu plugin layout đã live; catalogs dual-write còn lại |
| 0.1 | 2026-06-12 | Initial draft (monolithic spec) |
| 0.2 | 2026-06-12 | Tách khung; spec node chuyển sang `docs/workflow-nodes/` |
