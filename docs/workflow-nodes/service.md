# Node: Service (`service_node`)

> **Trạng thái:** Draft (review)  
> **Liên kết:** [`agent.md`](./agent.md) · [`vectorize.md`](./vectorize.md) · [`saveRag.md`](./saveRag.md) · [`getRag.md`](./getRag.md) · [`rag-recipes.md`](./rag-recipes.md)  
> **Spec chính:** [`workflow-node-plugin-spec.md`](../workflow-node-plugin-spec.md)

Service là **resource node** cung cấp AI Hub endpoint (chat + embedding) cho Agent qua handle **Service**. Node **không** nằm trên luồng data-flow chính — `skipExecution: true`.

---

## 1. Tóm tắt

| Thuộc tính | Giá trị |
|------------|---------|
| **ID** | `service_node` |
| **Category** | `resource` |
| **Vai trò** | Resolve model + billing endpoint cho Agent |
| **Loại plugin** | Resource only (`skipExecution: true`) |
| **Nối tới Agent** | `service_node.service` → `agent.service` (đứt nét, bắt buộc) |
| **Dùng trong RAG** | Embed (ingest) + generate (Q&A) qua cùng hoặc khác service catalog |

---

## 2. Graph representation

```json
{
  "id": "svc_embed",
  "type": "service_node",
  "position": { "x": 320, "y": 280 },
  "data": {
    "label": "Embedding Service",
    "endpoint": "/dashboard/assistant/embed",
    "catalogId": "cf-bge-base-en",
    "capabilities": ["embed", "chat"]
  }
}
```

**Edge tới Agent:**

```json
{
  "id": "edge_svc_agent",
  "source": "svc_embed",
  "target": "agent_1",
  "sourceHandle": "service",
  "targetHandle": "service",
  "style": { "strokeDasharray": "6 4" }
}
```

---

## 3. Handles

| Handle | Type | connectionType | Vị trí | Mô tả |
|--------|------|----------------|--------|-------|
| `service` | source | resource | Trên (diamond) | Nối vào handle **Service** của Agent |

Resource node **không** có handle `in` / `out` data-flow.

---

## 4. Config panel

Resource node dùng panel **Parameters** (không có INPUT/OUTPUT execute như Agent).

| Field UI | `node.data` key | Type | Default | Mô tả |
|----------|-----------------|------|---------|-------|
| **Label** | `label` | text | `"Service"` | Tên trên canvas |
| **Service** | `endpoint` | select / text | `""` | Approved AI Hub endpoint (`aiHubServiceSelect`) |
| **Catalog ID** | `catalogId` | text | `""` | ID catalog (fallback resolve model) |
| **Capabilities** | `capabilities` | multiselect | `["chat"]` | `chat`, `embed` — gợi ý runtime (Phase 2) |

**Resolve khi Agent execute** (`resolveAgentResources`):

```typescript
serviceEndpoint = data.endpoint ?? data.catalogId ?? data.serviceEndpoint
```

---

## 5. Runtime

| Hành vi | Trạng thái |
|---------|------------|
| Node tự execute trong graph | ❌ `skipExecution: true` |
| Inject `serviceEndpoint` vào Agent | ✅ `graph-helpers.ts` |
| Billing | Qua Agent → `billAgentUsage` |
| Embed PDF/chunk | ⚠️ Phase 2 — Agent/tool gọi model embed từ service này |

**Embedding trong RAG ingest:** Service có capability `embed` (vd. Workers AI `@cf/baai/bge-base-en-v1.5` hoặc embedding service trên catalog) được Agent / [`saveRag`](./saveRag.md) dùng để vector hóa chunk trước khi ghi Vectorize.

**Chat trong RAG Q&A:** Service có capability `chat` được Agent dùng sau khi [`getRag`](./getRag.md) trả context.

---

## 6. File map

| File | Vai trò |
|------|---------|
| `packages/workflow-nodes/src/nodes/builtins.ts` | Registry `service_node` |
| `workers/web/.../nodes/workflow-nodes.tsx` | `ServiceWorkflowNode` canvas |
| `workers/web/src/lib/n8n-workflow/descriptions/service-node.ts` | n8n properties |
| `workers/auth-worker/.../engine/graph-helpers.ts` | `resolveAgentResources` |
| `workers/auth-worker/.../billing.ts` | `resolveServiceByEndpoint`, `runTextModel` |

---

## 7. i18n keys

| Key | Mục đích |
|-----|----------|
| `node_service` | Tên catalog |
| `node_service_desc` | Mô tả |
| `field_service_endpoint` | Endpoint picker |
| `field_service_catalog` | Catalog ID |
| `handle_service` | Label handle trên Agent |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-13 | Draft — tương thích agent.md + RAG recipes |
