# Workflow API — Cấu trúc thư mục

Phụ thuộc đi **một chiều**: HTTP/trigger gọi engine; engine gọi node plugin; persist/RAG/billing là hạ tầng runtime. Không import `api/` từ `engine/` hay `nodes/`.

```
workflows/
├── api/                 # HTTP (Hono) — dashboard + public hooks
│   ├── presentation.ts
│   ├── hooks-presentation.ts
│   └── form-hooks-presentation.ts
├── domain/              # Zod schemas & constants (không phụ thuộc runtime)
│   ├── domain.ts
│   └── constant.ts
├── infrastructure/      # D1: shared catalog, royalties, comments
│   └── infrastructure.ts
├── engine/              # Duyệt graph, schedule, HITL, persist snapshot
│   ├── executor.ts
│   ├── graph-helpers.ts
│   ├── flow-helpers.ts
│   ├── loop-helpers.ts
│   ├── human-review-queue.ts
│   ├── persist-state.ts
│   └── index.ts
├── execution/           # Context, UserDO execution rows, agent toolset
│   ├── workflow-context.ts
│   ├── execution-store.ts
│   ├── execution-progress.ts
│   ├── execution-observability.ts
│   ├── node-runtime.ts
│   └── agent-runtime.ts
├── nodes/               # Plugin registry — một folder / runtime type
│   ├── index.ts
│   ├── types.ts
│   └── <type>/          # execute.ts | trigger.ts | skipExecution
│       └── tool/        # save-rag, get-rag, get-db-info, shared/
├── rag/                 # Vectorize embed / query / upsert + namespace
│   ├── index.ts
│   ├── rag-vector.ts
│   └── vectorize-scope.ts
├── triggers/            # D1 trigger rows, cron, webhook/form/channel ingress
│   ├── triggers.ts
│   ├── channel-hooks.ts
│   ├── webhook-auth.ts
│   ├── webhook-notify.ts
│   ├── form-auth.ts
│   ├── form-submission.ts
│   └── form-trigger-runner.ts
├── billing/
├── collab/
├── storage/
├── integrations/
└── README.md
```

## Entry points

| Import | File |
|--------|------|
| `createWorkflowRoutes` | `api/presentation.ts` |
| `createWorkflowHookRoutes` | `api/hooks-presentation.ts` |
| `createFormHookRoutes` | `api/form-hooks-presentation.ts` |
| `dispatchDueCronTriggersForOwner` | `triggers/triggers.ts` — UserDO alarm enqueue |
| `consumeWorkflowCronRun` | `triggers/triggers.ts` — queue consumer |
| `executeWorkflowGraph` | `engine/executor.ts` |
| `WorkflowDefinitionSchema` | `domain/domain.ts` |
| Vectorize helpers | `rag/index.ts` |

## Thêm node executor mới

1. Tạo `nodes/<type>/execute.ts` (hoặc `trigger.ts`)
2. Đăng ký trong `nodes/index.ts`
3. Bổ sung type trong `domain/domain.ts` → `WorkflowNodeTypeSchema` nếu type runtime mới
