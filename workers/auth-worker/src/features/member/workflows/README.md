# Workflow API — Cấu trúc thư mục

```
workflows/
├── api/                 # HTTP routes (Hono)
│   ├── presentation.ts       # CRUD, execute, collab, earnings (auth)
│   └── hooks-presentation.ts # Public webhooks & channel hooks
├── domain/              # Types, Zod schemas, constants
│   ├── domain.ts
│   └── constant.ts
├── infrastructure/      # D1 queries (shared workflows, royalties, comments)
│   └── infrastructure.ts
├── execution/           # Runtime context & node helpers
│   ├── workflow-context.ts
│   ├── execution-store.ts
│   ├── execution-observability.ts
│   ├── node-runtime.ts
│   └── agent-runtime.ts
├── engine/              # Graph executor & flow helpers
│   ├── executor.ts
│   ├── graph-helpers.ts
│   └── flow-helpers.ts
├── nodes/               # Node plugin registry (per-type execute)
├── triggers/            # Cron, webhook, channel triggers
│   ├── triggers.ts
│   ├── channel-hooks.ts
│   ├── webhook-auth.ts
│   └── webhook-notify.ts
├── billing/             # Service pricing, royalties, earnings
│   ├── billing.ts
│   ├── royalty.ts
│   ├── get-royalty-percent.ts
│   └── earnings-monthly.ts
├── collab/              # Real-time collab & AI authoring
│   ├── workflow-collab.ts
│   ├── workflow-chat.ts
│   └── ai-authoring.ts
├── storage/             # Credentials & version snapshots
│   ├── credentials.ts
│   └── version-store.ts
├── integrations/        # Integration presets catalog
│   └── integrations.ts
├── executor.ts          # Re-export → engine/executor
├── flow-helpers.ts      # Re-export → engine/flow-helpers
└── graph-helpers.ts     # Re-export → engine/graph-helpers
```

## Entry points

| Import | File |
|--------|------|
| `createWorkflowRoutes` | `api/presentation.ts` |
| `createWorkflowHookRoutes` | `api/hooks-presentation.ts` |
| `runDueCronTriggers` | `triggers/triggers.ts` |
| `WorkflowDefinitionSchema` | `domain/domain.ts` |

## Thêm node executor mới

1. Tạo `nodes/<type>/execute.ts`
2. Đăng ký trong `nodes/index.ts`
3. Bổ sung type trong `domain/domain.ts` → `WorkflowNodeTypeSchema`
