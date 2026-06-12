# Frontend Node UI Plugin Template

Copy this folder to `nodes/<name>/` when adding a new built-in workflow node.

## Checklist

1. Read `docs/workflow-node-plugin-spec.md` and `docs/workflow-nodes/<name>.md`
2. Create `canvas.tsx` — React Flow node component
3. Create `defaults.ts` — `defaults()` for new node data
4. Create `config-panel.tsx` only if generic panel is insufficient
5. Export `WorkflowNodeUIPlugin` from `index.ts`
6. Register in `nodes/index.ts` → `BUILTIN_UI_PLUGINS`
7. Add i18n keys in `messages/en-US.json` and `messages/vi-VN.json`

## Files

| File | Required | Purpose |
|------|----------|---------|
| `index.ts` | Yes | Plugin entry — catalog, Canvas, ConfigPanel |
| `canvas.tsx` | Yes | React Flow `NodeProps` component |
| `defaults.ts` | Yes | Default `node.data` when adding from catalog |
| `config-panel.tsx` | Optional | Custom config UI |
| `n8n-properties.ts` | Optional | n8n-style parameter definitions |

## Reference

See `nodes/webhook/` for trigger + custom config panel pattern.
