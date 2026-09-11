# Workflow Node Plugin Architecture — Spec

> **Trạng thái:** Implemented (còn catalog dual-write + align runtimeType)  
> **Phiên bản:** 0.3  
> **Ngày:** 2026-09-11  
> **Phạm vi:** Backend (`auth-worker`), Frontend (`web`), Shared package (`packages/workflow-nodes`)

Tài liệu **spec chính** mô tả kiến trúc **Node Plugin** — cách tổ chức lại workflow system để mỗi node là một module độc lập, dễ phát triển và bảo trì. Webhook node là **reference implementation** đầu tiên.

---

## Bản đồ tài liệu

| Tài liệu | Vai trò |
|----------|---------|
| **File này** (`workflow-node-plugin-spec.md`) | Spec tổng hợp — contracts, cấu trúc, migration |
| [`workflow-node-plugin-architecture.md`](./workflow-node-plugin-architecture.md) | Kiến trúc khung (bản rút gọn, cùng nội dung cốt lõi) |
| [`workflow-how-it-works.md`](./workflow-how-it-works.md) | Luồng vận hành từng bước (editor → trigger → executor) |
| [`workflow-nodes/README.md`](./workflow-nodes/README.md) | Index spec từng node + template tạo node mới |
| [`workflow-nodes/webhook.md`](./workflow-nodes/webhook.md) | Spec chi tiết node webhook (mẫu) |
| [`workers/web/.../workflows/README.md`](../workers/web/src/app/(main)/dashboard/build/workflows/README.md) | Kiến trúc workflow hiện tại (builder, registry, admin) |

**Quy ước phát triển node mới:**

1. Đọc spec này + [`workflow-how-it-works.md`](./workflow-how-it-works.md)
2. Tạo `docs/workflow-nodes/<tên-node>.md` theo template
3. Implement module `nodes/<name>/` (BE + FE)
4. Tham chiếu [`webhook.md`](./workflow-nodes/webhook.md) nếu cần trigger hoặc custom panel

---

## 1. Mục tiêu

### 1.1 Đã làm / còn lại

Kiến trúc plugin **đã triển khai**. Executor không còn switch-case; shared package là SSOT.

| Lớp | Hiện tại | Còn lại |
|-----|----------|---------|
| Executor | `engine/executor.ts` → `nodePluginRegistry.resolve` | Kind if/else **trong** plugin (flow, tool) |
| Schema / Registry | `@aiagents-hub/workflow-nodes`; web `default-nodes.ts` là shim | Auth-worker không còn duplicate `default-nodes.ts` |
| Add-node catalog | `catalogs/*.ts` **vẫn** drive drawer | `NODE_CATALOG` từ UI plugins chưa wired vào add-node |
| Canvas UI | `nodes/<name>/canvas.tsx`; `workflow-nodes.tsx` shim | Không có FE folder `http-request/` / `code/` |
| Config panel | Router + `plugin.ConfigPanel` (webhook, form, agent, service, memory, gmail) | — |
| Trigger / Hook | `nodes/webhook/trigger.ts`; form `form-hooks-presentation.ts` | Production webhook auth = API token, không phải `node.data.webhookAuth` |
| Connection rules | Shared package + FE/BE helpers | `handles[]` chưa đủ mọi family |

**Hệ quả hiện tại:** Thêm kind mới = shared `kinds.ts` + factory plugin (hoặc override folder) + **vẫn** thêm dòng `catalogs/*.ts` nếu muốn hiện trên add-node.

### 1.2 Mục tiêu thiết kế

1. **Một node = một module** — schema, runtime, canvas, config, trigger (nếu có) cùng namespace.
2. **Single source of truth** — schema/defaults trong shared package; catalog sinh từ registry.
3. **Engine tách khỏi node** — graph traversal, scheduling, edge validation là infrastructure.
4. **Spec per node** — mỗi node có `.md` riêng trong `docs/workflow-nodes/` để hướng dẫn Cursor.
5. **Migration incremental** — giữ backward-compatible re-exports.

### 1.3 Non-goals

- Đổi format JSON graph.
- Third-party node plugins từ npm.
- Xóa `catalogs/*.ts` trước khi add-node chuyển sang `NODE_CATALOG`.

---

## 2. Tổng quan kiến trúc

```mermaid
flowchart TB
  subgraph Docs["docs/"]
    Spec["workflow-node-plugin-spec.md"]
    How["workflow-how-it-works.md"]
    WH["workflow-nodes/webhook.md"]
  end

  subgraph Shared["packages/workflow-nodes"]
    Def["Node definitions\n(schema, defaults, handles)"]
    Conn["Connection rules"]
  end

  subgraph Backend["auth-worker / workflows"]
    Engine["engine/\nexecutor, graph-helpers"]
    NodeReg["nodes/index.ts\nplugin registry"]
    NodeBE["nodes/<name>/"]
    Engine --> NodeReg --> NodeBE
  end

  subgraph Frontend["web / build/workflows"]
    CanvasEng["engine/\ncanvas, edges"]
    NodeUI["nodes/index.ts\nUI plugin registry"]
    NodeFE["nodes/<name>/"]
    CanvasEng --> NodeUI --> NodeFE
  end

  Spec --> NodeBE
  WH --> NodeBE
  Def --> NodeReg
  Def --> NodeUI
  Conn --> Engine
  Conn --> CanvasEng
```

### 2.1 Ba tầng

| Tầng | Trách nhiệm | Không làm |
|------|-------------|-----------|
| **Shared** (`packages/workflow-nodes`) | Types, Zod schema, defaults, handle metadata, connection rules | Import React, Workers runtime, KV/D1 |
| **Engine** | Graph CRUD, traversal, scheduling, billing, collab | Logic nghiệp vụ từng node |
| **Node Plugin** | Execute, trigger, canvas, config panel, catalog entry | Tự implement edge traversal |

### 2.2 Cấu trúc tài liệu

```
docs/
├── workflow-node-plugin-spec.md           ← spec chính (file này)
├── workflow-node-plugin-architecture.md   ← kiến trúc khung (rút gọn)
├── workflow-how-it-works.md               ← luồng vận hành từng bước
└── workflow-nodes/
    ├── README.md                          ← index + template
    ├── webhook.md                         ← reference node
    └── <tên-node>.md                      ← thêm khi phát triển node mới
```

---

## 3. Shared Package — `packages/workflow-nodes`

### 3.1 Cấu trúc thư mục

```
packages/workflow-nodes/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types/
    │   ├── node-definition.ts      # WorkflowNodeDefinition, sections, fields
    │   ├── graph.ts                # WorkflowDefinition, Edge, NodeOutput
    │   ├── handles.ts              # HandleDefinition, ConnectionType
    │   └── connection-rules.ts     # isValidConnection, branch handles
    ├── registry/
    │   ├── merge.ts                # Merge KV overrides + builtins
    │   └── resolve.ts              # resolveNodeDefinition(runtimeType, kind)
    └── nodes/
        ├── index.ts                # BUILTIN_NODE_DEFINITIONS
        └── <name>/
            ├── definition.ts       # Registry entry
            └── schema.ts           # Zod cho node.data
```

### 3.2 Node Definition

```typescript
/** ID: "{runtimeType}" hoặc "{runtimeType}:{kind}" */
export interface WorkflowNodeDefinition {
  id: string;                         // "trigger:webhook"
  runtimeType: WorkflowNodeType;      // "trigger"
  kind?: string;                      // "webhook"
  category: NodeCategory;
  nameKey: string;
  isBuiltin: true;
  isActive: boolean;
  sections: NodeSection[];            // input | parameters | output
  defaultData?: Record<string, unknown>;
  handles?: HandleDefinition[];
}

export interface HandleDefinition {
  id: string;                         // "in" | "out" | "true" | "service" | ...
  type: 'source' | 'target';
  connectionType: 'main' | 'branch' | 'resource';
  maxConnections?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
}
```

### 3.3 Connection Rules

Quy tắc kết nối **tập trung** — không nằm trong từng node plugin:

```typescript
export type ConnectionType = 'main' | 'branch' | 'resource';

export function isValidWorkflowConnection(
  sourceNode: GraphNode,
  sourceHandle: string | null,
  targetNode: GraphNode,
  targetHandle: string | null,
  definitions: Map<string, WorkflowNodeDefinition>,
): boolean;
```

Node plugin chỉ **khai báo handles**; engine (backend + frontend) validate và render.

### 3.4 Consumers

| Consumer | Import |
|----------|--------|
| `workers/web` | definitions, types, connection rules, merge |
| `workers/auth-worker` | definitions, types, connection rules |
| Admin workflow-nodes | definitions làm defaults |

**Migration:** web `default-nodes.ts` re-export từ package. Auth-worker không còn file duplicate.

---

## 4. Backend — Node Plugin System

### 4.1 Cấu trúc thư mục

```
workers/auth-worker/src/features/member/workflows/
├── api/
│   ├── presentation.ts             # CRUD, execute, collab (auth)
│   ├── hooks-presentation.ts       # /hooks/workflows/:workflowId/:path
│   └── form-hooks-presentation.ts
├── domain/
├── execution/
├── engine/                         # executor, graph/flow/loop, HITL, persist
├── nodes/
│   ├── index.ts                    # BUILTIN_PLUGINS (family → factory → override)
│   ├── types.ts
│   └── <name>/                     # execute.ts | trigger.ts | skipExecution
├── triggers/                       # D1, cron, form-trigger-runner, webhook-auth
├── rag/                            # Vectorize embed / query / upsert
├── billing/, collab/, storage/, integrations/
└── README.md
```

### 4.2 Plugin Contract

```typescript
export interface NodeContext {
  node: WorkflowDefinition['nodes'][number];
  nodeInput: NodeOutput;
  definition: WorkflowDefinition;
  outputs: Map<string, NodeOutput>;
  runContext: RunContext;
  input?: string;
  userDO: UserDO;
  c: ExecutionContext;
  meta: WorkflowMeta;
  attr: WorkflowAttribution;
  requestMeta?: RequestMeta;
}

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

export interface NodePluginRegistry {
  get(key: string): WorkflowNodePlugin | undefined;
  resolve(node: GraphNode): WorkflowNodePlugin | undefined;
}
```

### 4.3 Executor Dispatch

```typescript
// engine/executor.ts
async function executeNodeLogic(node, nodeInput, ctx, onCost) {
  const plugin = nodeRegistry.resolve(node);
  if (!plugin) throw new Error(`Unknown node type: ${node.type}`);
  if (plugin.skipExecution) return nodeInput;
  if (!plugin.execute) throw new Error(`Node ${plugin.id} has no execute handler`);
  return plugin.execute({ node, nodeInput, ...ctx, onCost });
}
```

**Trước refactor:** `switch (node.type) { case 'http_request': ... }`  
**Hiện tại:** registry lookup; mỗi node tự register. Kind dispatch còn lại nằm **trong** plugin (vd. `flow/execute.ts`, `tool/execute.ts`).

### 4.4 Trigger Routing

```typescript
const plugin = nodeRegistry.findByTriggerType(trigger.type);
return plugin.trigger.handle(request, trigger);
```

### 4.5 Mapping file hiện tại → plugin

| Logic | File hiện tại |
|-------|----------------|
| HTTP Request | `nodes/http-request/execute.ts` (+ `core:http_request` plugin) |
| Code | `nodes/code/execute.ts` |
| Agent | `nodes/agent/execute.ts` + `execution/agent-runtime.ts` |
| Flow | `nodes/flow/execute.ts` + `engine/flow-helpers.ts` / `loop-helpers.ts` |
| Trigger pass-through | `nodes/trigger/execute.ts` |
| Webhook HTTP ingress | `nodes/webhook/trigger.ts` ← `api/hooks-presentation.ts` |
| Human review pause | engine loop + `nodes/human-review/` (gmail execute) |
| RAG tools | `nodes/tool/save-rag/`, `get-rag/`, `get-db-info/` |
| Resource nodes | `nodes/service-node/`, `memory-node/` (`skipExecution`) |

---

## 5. Frontend — Node UI Plugin System

### 5.1 Cấu trúc thư mục

```
workers/web/src/app/(main)/dashboard/build/workflows/
├── _components/
│   ├── canvas/                     # React Flow canvas, controls, theme
│   │   ├── workflow-canvas.tsx
│   │   └── workflow-canvas-ui-context.tsx
│   ├── editor/                     # Shell, header, sidebar, settings
│   ├── add-node/                   # Add-node drawer & panel
│   ├── edges/                      # Edges, handles, connection utils
│   │   ├── workflow-edge-utils.ts
│   │   ├── workflow-connection-utils.ts
│   │   └── connection-handle.tsx
│   ├── layout/                     # Placement, definition JSON
│   │   ├── workflow-definition.ts
│   │   └── workflow-create-connected-node.ts
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
│   │   │   ├── workflow-node-config-panel.tsx   # Router
│   │   │   └── generic-config-panel.tsx
│   │   └── workflow-panels/        # Build, executions, triggers, versions
│   ├── catalogs/                   # Add-node drawer (vẫn dùng)
│   ├── hooks/                      # State, undo, collab, integrations
│   └── engine/                     # Re-exports edges & layout helpers
└── _lib/
```

**Hai catalog:** `catalogs/*.ts` vẫn drive add-node. `NODE_CATALOG` từ UI plugins **chưa** thay catalogs. Admin flags: `packages/workflow-nodes/src/catalog/entries.ts`.

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
export const BUILTIN_UI_PLUGINS: WorkflowNodeUIPlugin[] = [/* ... */];
export const NODE_CATALOG = groupBy(
  BUILTIN_UI_PLUGINS.filter(p => p.catalog.visible !== false),
  p => p.catalog.category,
);

const plugin = resolveUIPlugin(selectedNode);
if (plugin?.ConfigPanel) return <plugin.ConfigPanel ... />;
return <GenericConfigPanel ... />;
```

### 5.4 Add Node Flow

```
Catalog pick → resolveUIPlugin(id) → createNode({ type, data: defaults() }) → canvas
```

### 5.5 Mapping file hiện tại → plugin

| File hiện tại | Ghi chú |
|---------------|---------|
| `nodes/webhook/config-panel.tsx` | Custom panel (shim cũ `panels/node-config/webhook-node-config-panel.tsx` nếu còn) |
| `nodes/webhook/n8n-properties.ts` | n8n INodeProperties |
| `nodes/webhook/defaults.ts` | Defaults trigger/core |
| `catalogs/workflow-trigger-catalog.ts` | **Vẫn** dùng cho add-node |
| `nodes/workflow-nodes.tsx` | Re-export shim |

---

## 6. Reference node — Webhook

Webhook là node **phức tạp nhất** (trigger + custom panel + dual model canvas/D1). Chi tiết đầy đủ:

→ **[`docs/workflow-nodes/webhook.md`](./workflow-nodes/webhook.md)**

Tóm tắt:

| Khía cạnh | Canvas node | D1 `workflow_triggers` |
|-----------|-------------|------------------------|
| Lưu trữ | `definition.nodes[].data` | Bảng `workflow_triggers` |
| HTTP entry | Không | Canonical `/hooks/workflows/:workflowId/:path` (API token). Legacy `/:ownerId/:token` |
| Plugin sở hữu | Config UI | `trigger.ts` (create/handle) |

---

## 7. Quy tắc đặt tên & ID

### 7.1 Node ID

| Pattern | Ví dụ | Khi dùng |
|---------|-------|----------|
| `{runtimeType}` | `agent`, `flow` | Không sub-kind |
| `{runtimeType}:{kind}` | `trigger:webhook`, `core:http_request` | Có sub-kind trong `node.data` |

### 7.2 Kind keys trong `node.data`

| runtimeType | Kind field | Ví dụ |
|-------------|------------|-------|
| `trigger` | `triggerKind` | `webhook`, `schedule`, `manual` |
| `core` | `coreKind` | `http_request`, `webhook`, `code` |
| `flow` | `flowKind` | `if`, `switch`, `merge`, `filter` |
| `human_review` | `channel` | `slack`, `gmail`, `telegram` |
| `data_transformation` | `transformKind` | `edit_fields`, `filter`, `sort` |
| `tool_node` | `toolKind` | `save-rag`, `get-rag`, `http_request` |
| `memory_node` | `memoryKind` | `vectorize`, `simple`, `redis` |
| `agent` | `agentKind` | `tools_agent` |

Kind-expanded families use a **factory** to generate `{runtimeType}:{kind}` definitions + BE/FE plugins. Dedicated override modules (e.g. `webhook/`, `form/`, `http-request/`, `tool/save-rag/`, `memory` vectorize panel) skip the factory and own their own files.

### 7.3 File naming

| Loại | Pattern | Ví dụ |
|------|---------|-------|
| Plugin entry | `index.ts` | `nodes/webhook/index.ts` |
| Execute | `execute.ts` | `nodes/http-request/execute.ts` |
| Trigger | `trigger.ts` | `nodes/webhook/trigger.ts` |
| Canvas | `canvas.tsx` | `nodes/webhook/canvas.tsx` |
| Config | `config-panel.tsx` | `nodes/webhook/config-panel.tsx` |
| Spec doc | `docs/workflow-nodes/<name>.md` | `webhook.md` |

---

## 8. Checklist — Thêm node built-in mới

> Chi tiết từng node: `docs/workflow-nodes/<name>.md`

### 8.1 Tài liệu

- [ ] Tạo `docs/workflow-nodes/<name>.md` theo template
- [ ] Cập nhật `docs/workflow-nodes/README.md`

### 8.2 Shared package

- [ ] `packages/workflow-nodes/src/nodes/<name>/definition.ts`
- [ ] `kinds.ts` nếu family có nhiều variant
- [ ] Export từ `nodes/index.ts` + `builtins.ts` nếu cần

### 8.3 Backend

- [ ] `nodes/<name>/execute.ts` (nếu executable)
- [ ] `nodes/<name>/trigger.ts` (nếu external trigger)
- [ ] `nodes/<name>/index.ts` — register plugin
- [ ] Register trong `nodes/index.ts` (family / factory / override last)

### 8.4 Frontend

- [ ] `nodes/<name>/canvas.tsx`
- [ ] `nodes/<name>/defaults.ts`
- [ ] `nodes/<name>/config-panel.tsx` (nếu generic không đủ)
- [ ] Register trong `nodes/index.ts`
- [ ] **Add-node:** thêm entry `catalogs/*.ts` (drawer chưa đọc `NODE_CATALOG`)
- [ ] i18n: `messages/en-US.json`, `messages/vi-VN.json`

### 8.5 Verify

- [ ] Add từ catalog → canvas OK
- [ ] Config panel OK
- [ ] Edge validation OK
- [ ] Execute workflow OK
- [ ] Trigger endpoint OK (nếu có)

---

## 9. Lộ trình Migration

| Phase | Mục tiêu | Trạng thái |
|-------|----------|------------|
| **1** | Webhook module | **Done** |
| **2** | Shared package | **Done** — `@aiagents-hub/workflow-nodes` |
| **3** | Backend plugin registry + `engine/` | **Done** |
| **4** | Frontend plugin + auto catalog | **Partial** — plugins xong; add-node vẫn catalogs |
| **5** | Align `runtimeType` | **Partial** — `http_request`/`code` dual shape |

**Không làm tiếp theo kiểu Phase 1:** Move webhook lần nữa. Việc còn: wire `NODE_CATALOG` vào add-node, thu hẹp catalog-only stubs.

---

## 10. Backward Compatibility

1. **Re-export shims** — file cũ export từ path mới.
2. **Import paths** — không breaking cho đến Phase 4 xong.
3. **Graph JSON** — không đổi format.
4. **Admin KV overrides** — merge logic giữ nguyên.

---

## 11. Testing Strategy

| Layer | Test type | Vị trí |
|-------|-----------|--------|
| Shared | Unit: schema, connection rules | `packages/workflow-nodes/**/*.test.ts` |
| Backend execute | Unit per plugin | `nodes/<name>/execute.test.ts` |
| Backend trigger | Integration | `nodes/<name>/trigger.test.ts` |
| Frontend | Component | Vitest + RTL |
| E2E | add → connect → execute | e2e suite |

---

## 12. Open Questions

| # | Câu hỏi | Đề xuất tạm |
|---|---------|-------------|
| 1 | `execution/node-runtime.ts` shared hay per-node? | Shared cho HTTP/code helpers |
| 2 | Một `runtimeType` nhiều Canvas? | Một component, handles dynamic theo kind |
| 3 | Admin custom nodes cần plugin folder? | Không — generic canvas + panel |
| 4 | Unify webhook canvas ↔ D1 trigger? | Phase 5+ |
| 5 | Package name? | `@aiagents-hub/workflow-nodes` |

---

## 13. So sánh Before / After

| Hành động | Before | After |
|-----------|--------|-------|
| Thêm node built-in | ~12 files, 4+ dirs | ~4–6 files, 1 dir + 1 spec `.md` |
| Hướng dẫn Cursor | Không có | `docs/workflow-nodes/<name>.md` |
| Tìm code node | Grep repo | `nodes/<name>/` |
| Catalog | Sửa `catalogs/*.ts` | `catalog` trong plugin |
| Schema defaults | 2 files duplicate | 1 shared definition |
| Executor | Switch-case | Registry dispatch |

---

## 14. Phụ lục — Cấu trúc hiện tại

<details>
<summary>Backend (hiện tại — sau tổ chức lại thư mục)</summary>

```
workers/auth-worker/src/features/member/workflows/
├── api/                     # presentation, hooks-presentation
├── domain/                  # domain.ts, constant.ts
├── execution/               # context, store, node-runtime, agent-runtime
├── engine/                  # executor, graph-helpers, flow-helpers
├── nodes/                   # plugin registry
├── rag/                     # Vectorize embed / query / upsert
├── triggers/                # triggers.ts, channel-hooks, webhook-auth
├── billing/, collab/, storage/, integrations/
└── README.md
```

</details>

<details>
<summary>Frontend (hiện tại — sau tổ chức lại thư mục)</summary>

```
workers/web/.../build/workflows/_components/
├── canvas/                  # workflow-canvas.tsx, controls, theme
├── editor/                  # shell, header, sidebar
├── add-node/                # drawer, panel
├── edges/                   # connection-handle, edge utils
├── layout/                  # definition, placement
├── nodes/                   # UI plugin registry (`workflow-nodes.tsx` = shim)
├── panels/
│   ├── node-config/         # config panel router
│   └── workflow-panels/     # executions, triggers, versions, …
├── catalogs/                # add-node drawer (vẫn dùng; chưa xóa)
└── hooks/                   # canvas state, undo, collab
```

</details>

---

## 15. Hướng dẫn Cursor (prompt gợi ý)

**Implement node mới:**

```
Đọc docs/workflow-node-plugin-spec.md và docs/workflow-nodes/<name>.md.
Implement plugin nodes/<name>/ (BE + FE) + definition trong packages/workflow-nodes.
Thêm catalogs/*.ts nếu node phải hiện trên add-node drawer.
Tham chiếu docs/workflow-nodes/webhook.md nếu cần trigger/custom panel.
Không thêm switch-case vào engine/executor.ts.
```

**Webhook (đã có module — chỉ sửa khi cần):**

```
Webhook plugin đã ở nodes/webhook/ (BE + FE).
Canonical URL: /hooks/workflows/:workflowId/:path + API token.
Đọc docs/workflow-nodes/webhook.md trước khi đổi ingress.
```

**Hiểu luồng runtime:**

```
Đọc docs/workflow-how-it-works.md trước khi sửa executor hoặc trigger.
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.3 | 2026-09-11 | Spec phản ánh plugin layout đã live; remaining = catalogs + runtimeType align |
| 0.1 | 2026-06-12 | Initial draft (monolithic) |
| 0.2 | 2026-06-12 | Tách spec node sang `docs/workflow-nodes/`; thêm `workflow-how-it-works.md` |
| 0.2.1 | 2026-06-12 | Tạo lại file spec chính với bản đồ tài liệu |
