# Backend Node Plugin Template

Copy this folder to `nodes/<name>/` when adding a new built-in workflow node.

## Checklist

1. Read `docs/workflow-node-plugin-spec.md` and `docs/workflow-nodes/<name>.md`
2. Create `execute.ts` if the node runs during graph execution
3. Create `trigger.ts` if the node has an external HTTP/cron ingress
4. Export a `WorkflowNodePlugin` (`*Plugin`) from `index.ts`
5. Register the plugin import in `nodes/index.ts` → `BUILTIN_PLUGINS`
6. Add shared definition in `packages/workflow-nodes/src/nodes/<name>/definition.ts`
7. Add frontend UI plugin in `web/.../nodes/<name>/`

## Family + kind

If the node is a **sub-kind** of an existing family (`human_review`, `flow`, `core`, `trigger`, `data_transformation`):

1. Prefer the family **factory** (`create*KindPlugin`) — no new folder needed for stubs
2. Add a dedicated folder only when execute/trigger logic differs (override) — and list the kind in `*_OVERRIDE_KINDS`
3. Kind field must be set on `node.data` (`channel`, `flowKind`, `coreKind`, `triggerKind`, `transformKind`)

## Files

| File | Required | Purpose |
|------|----------|---------|
| `index.ts` | Yes | Plugin entry — id, runtimeType, kind, execute/trigger/skip |
| `execute.ts` | If executable | `execute(ctx) => NodeOutput` |
| `trigger.ts` | If external trigger | `create`, `handle`, optional `delete` |

## Reference

See `nodes/webhook/` for trigger + pass-through override pattern.
See `nodes/human-review/` for family + channel factory pattern.
See `nodes/agent/` for execute-only pattern.
