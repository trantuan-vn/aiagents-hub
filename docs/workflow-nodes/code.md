# Tool: Code Mode (`tool_node:code`)

> **Trạng thái:** Done (v1)  
> **Family:** [`tool-nodes.md`](./tool-nodes.md)  
> **Gắn vào:** [`reasoning-agent.md`](./reasoning-agent.md) qua handle `tools`

Agent **viết JavaScript**; `createCodeTool` + `DynamicWorkerExecutor` chạy script trong sandbox. Trong script gọi `get_rag` / `check_sql` qua RPC. Outer model chỉ thấy một tool `{ code }` — schema/Oracle error không phình chat multi-step.

## 1. Wiring

Nối vào Reasoning Agent cùng **Get RAG** + **Check SQL**:

| Node | Vai trò |
|------|---------|
| `code` | Outer tool `codemode` — model sinh script |
| `get-rag` | Inner — chỉ gọi từ sandbox |
| `check-sql` | Inner — chỉ gọi từ sandbox |

Khi thiếu Get RAG hoặc Check SQL, runtime **không** collapse (giữ toolset cũ). Khi thiếu binding `LOADER`, giữ tool riêng lẻ và log warning.

## 2. Runtime

| File | Vai trò |
|------|---------|
| `nodes/tool/code/module.ts` | Registry (`toolClass: delegate`) |
| `nodes/tool/code/create.ts` | `createCodeModeOuterTool` |
| `execution/agent-runtime.ts` | `collapseToCodeModeTool` |
| Wrangler `worker_loaders` → `LOADER` | Dynamic Worker sandbox |

Sandbox: `globalOutbound: null` (không fetch internet).

## 3. Options (`node.data`)

| Key | Default | Mô tả |
|-----|---------|--------|
| `toolName` | `codemode` | Tên tool outer |
| `toolDescription` | (builtin) | Có thể chứa `{{types}}` |
| `timeoutMs` | `60000` | Timeout chạy script |

## 4. Anti-patterns

- Không dùng Code Mode thay `core:code` (transform trên data-flow)
- Không expose `get_rag` / `check_sql` ra outer khi collapse thành công
- Không `eval` tùy ý ngoài DynamicWorkerExecutor
