# Backend Node Plugin Template

Copy this folder to `nodes/<name>/` when adding a new built-in workflow node.

## Checklist

1. Read `docs/workflow-node-plugin-spec.md` and `docs/workflow-nodes/<name>.md`
2. Create `execute.ts` if the node runs during graph execution
3. Create `trigger.ts` if the node has an external HTTP/cron ingress
4. Export a `WorkflowNodePlugin` from `index.ts`
5. Register in `nodes/index.ts` → `registerAllNodes()`
6. Add shared definition in `packages/workflow-nodes/src/nodes/<name>/`

## Files

| File | Required | Purpose |
|------|----------|---------|
| `index.ts` | Yes | Plugin entry — id, runtimeType, kind, register |
| `execute.ts` | If executable | `execute(ctx) => NodeOutput` |
| `trigger.ts` | If external trigger | `create`, `handle`, optional `delete` |

## Reference

See `nodes/webhook/` for trigger + pass-through pattern.
