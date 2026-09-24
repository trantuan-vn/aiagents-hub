# Spec: Workflow Execution Logging — an toàn resume + tối ưu lưu trữ

> **Trạng thái:** Draft v1.2 — Phase 0 + 1 + 3 implemented (Phase 2 R2 offload deferred)  
> **Phiên bản:** 1.2  
> **Ngày:** 2026-09-22  
> **Phạm vi:** Ghi nhận mỗi lần chạy workflow (`workflow_executions` trên UserDO): snapshot resume, step I/O cho Logs UI, output cuối, progress WS  
> **Bổ sung, không thay thế:** kiến trúc engine → [`workflow-architecture.md`](./workflow-architecture.md); luồng vận hành → [`workflow-how-it-works.md`](./workflow-how-it-works.md); an toàn quy mô triệu user → [`scale-safety-million-users-spec.md`](./scale-safety-million-users-spec.md)  
> **Không thay thế:** Monitor Logs member (Phase B.1 scale-safety sẽ **đổi nguồn** từ raw `service_usages` sang execution ledger — xem [`scale-safety-million-users-spec.md`](./scale-safety-million-users-spec.md) §10 B.1); Admin Cloudflare Logs ([`admin-cloudflare-logs-spec.md`](./admin-cloudflare-logs-spec.md)); Workers structured logger

**Phase 0 (code):** UTF-8 gate, clip deterministic, ladder + fail-closed; `serializeOutputSummary`; resume thống nhất + `persistOrFailRun`; flags `ioClipped` / `legacyStub` / `persistDegraded`.

**Phase 1 (code):** nested `persistMeta`; always `stateCore` normalize (step preview 4KB); `PersistShape` trên plugin (`resumeFields` / `logFields` / `neverPersist`); `HOT_STATE_MAX_BYTES = 1MB`.

**Phase 3 (code):** retention theo gói (`executionHistoryMax` / `Days`); prune terminal khi list/create; `GET .../export` ZIP support (DO redacted — không lakehouse / Phase 2 blobs).

**Phase 2:** deferred — R2 I/O spill riêng, khác `R2_LAKEHOUSE`.

Coding bám spec này. Mục tiêu: **mọi lần persist đều deterministic và resume-safe**; phần “đẹp để xem log” được tối ưu lưu trữ, không được phá control-plane.

---

## 0. Hiện trạng và bất cập phải vá

### 0.1 Mô hình hiện tại

| Thành phần | Nội dung | Store |
|------------|----------|-------|
| `workflow_executions.state` | Snapshot engine (queue, visited, outputs, steps, loopStates, …) | UserDO SQLite |
| `workflow_executions.output` | Kết quả cuối (JSON string) | UserDO |
| `workflow_executions.error` | ≤ 2000 ký tự | UserDO |
| Progress WS | `output` clip ~24KB | Ephemeral |
| Agent tool observation | clip 4KB trước khi vào model | In-memory → có thể vào step output |

Persist qua `persistResult` → `capJson` / `serializePersistedState`  
(`workers/auth-worker/src/features/member/workflows/engine/{executor,persist-state}.ts`).

**Không** có env cấu hình kích thước. Hằng số cứng:

| Hằng | Giá trị | Vai trò |
|------|---------|---------|
| `MAX_PERSIST_BYTES` | 2_000_000 (đo bằng `JSON.stringify().length`) | Trần snapshot |
| `IO_BUDGETS` | `[96k, 32k, 8k, 2k]` | Nấc clip từng field I/O |
| `PROGRESS_OUTPUT_BUDGET` | 24_000 | Live WS |
| Run `input` | 8_000 | Clip trong snapshot |

### 0.2 Vì sao truncation trông “ngẫu nhiên” / gây lỗi bất ổn

1. **Hai chiến lược khác nhau**
   - `state`: compact thông minh (`ioTruncated`, giữ skeleton).
   - `output` (và lịch sử cũ của `state`): stub hủy `{ _truncated: true, byteLength }` — **không resume được**.
2. **Thang budget phụ thuộc kích thước từng lần chạy** — cùng workflow, lần nhỏ giữ đủ I/O; lần lớn nhảy xuống 2k hoặc bỏ hết step I/O → UI/log khác nhau từng run.
3. **`Object.entries` + cắt giữa object** — field nào sống sót phụ thuộc thứ tự key và kích thước lồng nhau → cảm giác “ngẫu nhiên”.
4. **Loop được miễn trừ clip `items`** trong khi node khác bị cắt → bất đối xứng; nếu `items` cực lớn, **last-resort vẫn có thể > 2MB** (không có gate cuối).
5. **Đường resume không đồng nhất**
   - HITL approve: có thể rebuild từ live definition.
   - Continue / checkpoint: fail cứng `"Execution state missing; cannot continue"` khi gặp stub.
6. **Đo size bằng JS string length**, không phải UTF-8 bytes → lệch với giới hạn storage thật.
7. **Persist lỗi trên continue chỉ `console.warn`** — chạy tiếp với state DO cũ → hành vi “lần sau mới fail”.
8. **UI gộp** `_truncated` stub và `ioTruncated` partial thành một cờ `truncated` → user không phân biệt “thiếu đẹp” vs “hỏng resume”.

### 0.3 Non-goals (giữ nguyên)

- Không biến `workflow_executions` thành kho stdout/stderr kiểu container.
- Không sync execution **snapshot/`state`** sang D1 (vẫn DO-local). Slim **ledger** (không state) → D1/R2 = scale-safety Phase B.1.
- Không thay Admin Cloudflare Observability.
- Monitor member Logs/Analytics: sau B.1 đọc ledger run, không còn đồng nghĩa raw `service_usages`.
- Không log secret plaintext vào blob observability (xem §5.4).

---

## 1. Mục tiêu thiết kế

| # | Mục tiêu | Tiêu chí chấp nhận |
|---|----------|-------------------|
| G1 | **Resume-safe mọi lúc** | Continue, checkpoint, HITL luôn khôi phục được control-plane nếu run còn `running` / `pending_human`. Không bao giờ persist `{_truncated}` cho `state`. |
| G2 | **Deterministic truncation** | Cùng snapshot đầu vào → cùng JSON persist (ổn định theo version schema). Field mất đi phải theo **bảng ưu tiên**, không theo thứ tự key. |
| G3 | **Tách control-plane vs observability** | Resume chỉ cần “core”; Logs UI có thể thiếu I/O đầy đủ hoặc đọc từ blob. |
| G4 | **Tối ưu lưu trữ** | Hot path DO nhỏ & có trần cứng (bytes). Payload lớn offload R2 (hoặc tương đương), TTL + GC. |
| G5 | **Fail-closed an toàn** | Nếu vẫn vượt trần sau mọi tầng: **từ chối persist I/O**, vẫn ghi core; báo `persistDegraded`; không silent-continue với state hỏng. |
| G6 | **Quan sát được** | API/UI phân biệt `ioClipped` / `ioOffloaded` / `persistDegraded` / legacy stub. |

---

## 2. Mô hình dữ liệu đề xuất

### 2.1 Tách hai lớp trong một execution

```
workflow_executions (UserDO) — HOT, nhỏ, bắt buộc
├── executionKey, status, costs, timestamps, error
├── inputSummary          // ≤ 8KB, đã redaction
├── outputSummary         // ≤ budget; không còn stub hủy toàn bộ
├── persistMeta           // schemaVersion, flags, sizes, offload refs
└── stateCore             // JSON resume-critical ONLY (xem §2.2)

execution_blobs (R2) — WARM/COLD, tùy chọn, có thể thiếu
└── {ownerHash}/{executionKey}/
    ├── steps/{nodeId}.json.gz     // step input/output đầy đủ (hoặc clipped có chủ đích)
    ├── outputs/{nodeId}.json.gz
    ├── final.json.gz
    └── manifest.json              // index + sha256 + byteLength + createdAt
```

**Nguyên tắc:** thiếu blob → Logs UI hiển thị banner “I/O archived / clipped”; **engine vẫn chạy tiếp được** từ `stateCore`.

### 2.2 `stateCore` — resume-critical (bắt buộc trong DO)

Giữ **tối thiểu** để engine tiếp tục:

| Nhóm | Field | Ghi chú |
|------|-------|---------|
| Cursor | `queue`, `visited`, `skipped`, `entryNodeId`, `pendingLoopReturn` | Không clip |
| Graph | `definition` **hoặc** `definitionRef` + `definitionOmitted` | Ưu tiên omit + reload live definition (đã có) |
| Meta | `meta`, `autoApproveHumanReview` | Nhỏ |
| Variables | `variables` (đã sanitize) | Clip theo budget riêng nếu cần |
| Outputs resume | `engine.outputs[nodeId]` **chỉ phần cần cho downstream / loop** | Xem §3.2 slim policy |
| Loop | `loopStates` (items cursor + credentials cần cho DB) | Items lớn → offload pointer (§3.3) |
| Run context | subset `__saveRagIndexedTables`, … | Whitelist như hiện tại |
| Steps skeleton | `steps[]` **không** `input`/`output` đầy đủ | Chỉ status, error, duration, cost, `ioRef?` |
| Flags | `schemaVersion`, `ioPolicy`, `persistDegraded?` | |

**Cấm** trong `stateCore`: `raw` LLM full response, toàn bộ RAG docs, webhook body lớn, `requestMeta`, `webhookItem`.

### 2.3 Observability payload (UI Logs)

| Nguồn | Khi nào có |
|-------|------------|
| Inline clip trong DO (`steps[].input/output` short) | Run nhỏ, dưới ngân sách hot |
| R2 blob theo `ioRef` | Run lớn / đã offload |
| Không có | TTL hết, GC, hoặc `persistDegraded` bỏ I/O |

API presentation trả:

```ts
type ExecutionPersistMeta = {
  schemaVersion: 1;
  /** I/O trong DO đã bị cắt theo policy có chủ đích */
  ioClipped: boolean;
  /** Có ít nhất một blob offload */
  ioOffloaded: boolean;
  /** Core vẫn OK nhưng I/O không đầy đủ / không ghi được blob */
  persistDegraded: boolean;
  /** Legacy: state từng là {_truncated} — chỉ đọc lịch sử */
  legacyStub: boolean;
  hotBytes: number;
  blobBytes?: number;
  clipPolicy?: string; // e.g. "v1/priority-ladder"
};
```

UI: **không** gộp hết thành một `truncated: true`. Map sang copy riêng (vi/en).

### 2.4 Tương thích ngược

| Bản ghi cũ | Hành vi |
|-----------|---------|
| Full state (không flag) | Đọc như hiện tại; lần persist sau migrate sang `stateCore` + optional blobs |
| `ioTruncated: true` | Coi = `ioClipped`; resume nếu còn `engine` |
| `{_truncated, byteLength}` | `legacyStub`; continue/checkpoint: **cùng recovery HITL** (rebuild từ live workflow) — thống nhất mọi đường resume |
| `output` stub | `outputSummary = null` + meta; không crash UI |

---

## 3. Policy cắt / offload (deterministic)

### 3.1 Đơn vị đo

- Dùng **UTF-8 byte length** (`TextEncoder`) cho mọi trần hot/blob.
- Giữ `JSON.stringify` chỉ để serialize; so sánh size sau encode.
- Hằng số đề xuất (có thể đưa env sau, mặc định cứng giống hiện tại):

| Tên | Default | Ý nghĩa |
|-----|---------|---------|
| `HOT_STATE_MAX_BYTES` | 512_000 | Trần `stateCore` trong DO (giảm từ 2MB hiệu dụng) |
| `HOT_IO_INLINE_MAX_BYTES` | 64_000 | Tổng I/O inline còn sót trong DO (nếu phase 1 chưa offload hết) |
| `STEP_IO_INLINE_MAX_BYTES` | 4_096 | Mỗi step input/output inline preview |
| `OUTPUT_SUMMARY_MAX_BYTES` | 16_384 | `output` cột |
| `BLOB_STEP_MAX_BYTES` | 2_000_000 | Một step blob; lớn hơn → clip có metadata |
| `PROGRESS_OUTPUT_BUDGET` | 24_000 | Giữ |

### 3.2 Thứ tự ưu tiên khi phải giảm size (bảng cố định)

Khi `hotBytes > HOT_STATE_MAX_BYTES`, áp dụng **tuần tự** các bước sau; dừng ngay khi đủ nhỏ. Mỗi bước ghi `clipPolicy` step id vào meta.

1. Drop `webhookItem` / `requestMeta` / agent `raw` / RAG document bodies trong outputs.
2. Slim mọi `steps[].input/output` → preview ≤ `STEP_IO_INLINE_MAX_BYTES` (hoặc bỏ hẳn, chỉ giữ `ioRef`).
3. Slim `finalOutput` / cột `output` → summary.
4. `definitionOmitted = true` (reload live khi resume — đã có).
5. Slim non-loop `engine.outputs` theo **allowlist per node type** (plugin khai báo `resumeFields`).
6. Loop `items`: nếu vẫn lớn → **offload items blob**, DO chỉ giữ `itemsRef` + `itemCount` + cursor; resume **bắt buộc** hydrate từ R2 trước khi chạy tiếp.
7. Nếu vẫn lớn: `persistDegraded = true`, drop toàn bộ observability I/O; **giữ** cursor + loopRefs + slim outputs allowlist. Không bao giờ ghi stub hủy engine.

**Cấm** dùng “duyệt `Object.entries` đến khi hết budget” làm cơ chế chính. Nếu clip nested object: sort key alphabetically rồi lấy prefix **ổn định**, hoặc chỉ giữ allowlist.

### 3.3 Plugin contract: `resumeFields` + `logFields`

Mỗi node plugin (hoặc shared kind default) khai báo:

```ts
type PersistShape = {
  /** Keys bắt buộc cho resume / downstream gather — luôn cố giữ trong stateCore */
  resumeFields?: string[];
  /** Keys chỉ phục vụ Logs UI — được clip/offload tự do */
  logFields?: string[];
  /** Keys không bao giờ persist (secret / raw) */
  neverPersist?: string[];
};
```

Default an toàn nếu plugin chưa khai báo:

- `neverPersist`: `password`, `connectString`, `raw`, `authorization`, `apiKey`, …
- `resumeFields`: `flowKind`, loop cursors, ids, counts, `ok`/`error` ngắn
- Còn lại = `logFields`

**Credentials loop:** không nhồi password vào outputs lâu dài. Prefer `credentialId` + resolve lúc resume (follow-up hardening; phase 1 có thể giữ behavior cũ nhưng đánh dấu debt).

### 3.4 Offload R2 — thuật toán

```
on persist:
  build stateCore (no bulky logFields)
  if sizeof(logPayload) == 0 → write DO only
  else if HOT enough for inline previews → DO only (ioClipped maybe)
  else:
    put gzip blobs under execution prefix (conditional: only changed steps)
    write manifest
    DO: stateCore + persistMeta.ioOffloaded=true + ioRefs
  if DO write would exceed HOT_STATE_MAX_BYTES after core-only:
    FAIL persist with typed error (caller phải surface; không warn-and-continue)
```

**Atomicity (thực dụng trên Workers):**

1. Put blobs trước (idempotent key theo `executionKey` + `revision`).
2. Update DO row với `revision++` và refs.
3. Orphan blobs: GC theo prefix + `revision` cũ (cron / alarm UserDO).

Resume path:

1. Load `stateCore` từ DO.
2. Nếu có `itemsRef` / thiếu output resume → `get` blob bắt buộc; fail rõ `blob_missing` (khác legacy stub).
3. Logs UI: lazy-fetch blobs khi user mở step (không nhồi vào list executions).

### 3.5 Cột `output` — bỏ stub hủy

Thay `capJson` destructive bằng:

```ts
serializeOutputSummary(value) →
  JSON trong OUTPUT_SUMMARY_MAX_BYTES
  hoặc { summary: clip(...), offloaded: true, ioRef: "final" }
```

Không còn `{_truncated: true}` cho write mới.

---

## 4. Hợp đồng API & UI

### 4.1 List / get execution

- List: không trả step I/O; trả `persistMeta` flags + `stepCount` + costs.
- Get detail: `steps` skeleton + preview inline; endpoint phụ `GET .../executions/:key/io/:nodeId` đọc blob (auth = owner).
- `truncated` legacy boolean: deprecate; giữ map tạm = `ioClipped || legacyStub` trong 1–2 release.

### 4.2 Copy UX (vi)

| Flag | Banner |
|------|--------|
| `ioClipped` | “Một phần input/output đã được rút gọn để tiết kiệm dung lượng. Resume không bị ảnh hưởng.” |
| `ioOffloaded` | “Chi tiết đầy đủ lưu trữ ngoài; mở từng bước để tải.” |
| `persistDegraded` | “Không lưu đủ nhật ký bước; trạng thái chạy vẫn được bảo toàn.” |
| `legacyStub` | “Bản ghi cũ không đủ để tiếp tục. Hãy chạy lại workflow.” (sau khi đã thử rebuild) |

### 4.3 Progress WS

Giữ budget 24KB; dùng cùng `clipValue` ổn định (sorted keys / allowlist), đánh dấu `clipped: true` trên event.

---

## 5. An toàn vận hành

### 5.1 Invariants (test bắt buộc)

1. Mọi `serializePersistedState` / `serializeStateCore` output parse được và có `engine.queue` (array).
2. Không emit `_truncated` stub cho writes mới.
3. Cùng input object → cùng output string (golden tests).
4. Loop mid-batch: sau compact/offload + hydrate, `items.length` và `currentBatchIndex` khớp.
5. `HOT_STATE_MAX_BYTES` sau encode luôn được tôn trọng; nếu không → throw typed, không partial write.
6. Continue và HITL dùng chung `resolvePersistedForResume` (một cửa).

### 5.2 Persist failure policy

| Tình huống | Hành vi |
|------------|---------|
| DO write fail | Propagate / fail run slice; **không** `console.warn` rồi chạy tiếp |
| R2 put fail | Persist core + `persistDegraded`; run tiếp được; log structured `execution.persist_blob_failed` |
| Blob missing lúc resume (itemsRef) | Fail với mã `execution_blob_missing` — user chạy lại hoặc retry hydrate |
| Legacy stub | Thử rebuild; không được → failed rõ ràng |

### 5.3 Retention & GC (tối ưu lưu trữ)

| Lớp | TTL đề xuất | Ghi chú |
|-----|-------------|---------|
| DO row (terminal: completed/failed/cancelled) | 30 ngày (configurable per plan sau) | Hoặc cap N executions / workflow |
| DO row `pending_human` / `running` | Không TTL theo age; chỉ khi user cancel/delete | |
| R2 blobs | 14 ngày hoặc theo DO row | Xóa khi xóa execution |
| Inline previews | Theo DO row | |

Alarm / cron nhẹ trên UserDO: quét `finishedAt` + xóa blob prefix.

### 5.4 Redaction

Trước mọi persist/offload:

- Mask keys trong denylist (case-insensitive): `password`, `token`, `authorization`, `apiKey`, `secret`, `connectString`, …
- Không ghi header webhook đầy đủ.
- Agent: không persist `raw` full; tối đa preview text đã có trong output chuẩn hóa.

---

## 6. Lộ trình triển khai

### Phase 0 — Stabilization (không cần R2) — **ưu tiên ngay**

1. Thống nhất resume: `resolvePersistedForResume` cho continue + checkpoint + HITL (rebuild khi stub / incomplete).
2. Bỏ write `{_truncated}` cho `output`; dùng summary clip.
3. Thêm gate cuối: nếu last-resort vẫn > trần → drop non-essential, assert size; throw nếu core vẫn lớn.
4. Clip deterministic: priority ladder §3.2 + sort keys; bỏ phụ thuộc `Object.entries` order.
5. Tách flag API: `ioClipped` vs `legacyStub`.
6. Persist error: không silent-continue.
7. Đo size bằng UTF-8 bytes.
8. Tests mở rộng từ `persist-state.test.ts` / `persist-loop-resume.test.ts`.

**Kết quả:** hết “lỗi bất ổn” do stub / budget ngẫu nhiên; storage vẫn chỉ DO nhưng ổn định hơn.

### Phase 1 — Slim `stateCore` + plugin `resumeFields`

1. Schema `persistMeta` + `schemaVersion: 1`.
2. Steps trong DO chỉ skeleton + preview ngắn.
3. Defaults `neverPersist` / slim agent-raw / RAG bodies.
4. Hạ `HOT_STATE_MAX_BYTES` dần (2MB → 1MB → 512KB) sau khi đo phân vị production.

### Phase 2 — R2 offload

1. Binding R2 bucket (hoặc reuse bucket hiện có nếu phù hợp).
2. Manifest + per-step/final blobs + lazy IO API.
3. Loop `itemsRef` hydrate.
4. GC/TTL.
5. UI “tải chi tiết bước”.

### Phase 3 — Product / plan limits (tuỳ chọn)

- Giữ lịch sử execution theo gói (số bản ghi / ngày).
- Export execution zip (core + blobs) cho support.

---

## 7. File chạm tới (dự kiến)

| File | Việc |
|------|------|
| `engine/persist-state.ts` | Core serialize, ladder, UTF-8 gate, bỏ stub path |
| `engine/executor.ts` | `capJson`, `persistResult`, resume thống nhất, fail policy |
| `execution/execution-store.ts` | Cột/meta nếu cần |
| `api/presentation.ts` | Flags mới, strip state |
| `nodes/**` + shared kinds | `resumeFields` / `neverPersist` |
| Web logs UI + i18n | Banner theo flag |
| `docs/workflow-architecture.md` | Link spec này ở mục lưu trữ |
| Tests | Golden + resume + oversized loop |

---

## 8. Tiêu chí xong (Definition of Done)

### Phase 0
- [x] Không còn code path ghi `{_truncated:true}` cho execution mới.
- [x] Continue / checkpoint / HITL cùng `resolvePersistedForResume`.
- [x] Golden test: truncation ổn định theo fixture.
- [x] Oversized loop: gate cuối + slim items / throw — không vượt `MAX_PERSIST_BYTES` im lặng.
- [x] UI phân biệt clipped / degraded / legacy.
- [x] Persist error: không silent-continue (`persistOrFailRun`).

### Phase 1
- [x] Nested `persistMeta` + `schemaVersion: 1` trên mọi snapshot normalize.
- [x] Steps trong DO luôn skeleton + preview ≤ `STEP_IO_INLINE_MAX_BYTES` (4KB).
- [x] `PersistShape` (`resumeFields` / `logFields` / `neverPersist`) trên agent, save-rag, get-rag, get-db-info, loop.
- [x] `HOT_STATE_MAX_BYTES = 1_000_000` (từ 2MB).

### Phase 3
- [x] `executionHistoryMax` / `executionHistoryDays` trên `PlanEntitlement`.
- [x] Prune terminal (không đụng running / pending_human) khi list + sau create.
- [x] `GET /executions/:key/export` → ZIP support (manifest, record, state, steps; secrets redacted).
- [x] UI Export tải ZIP từ API.

### Phase 2+
- [ ] Blob thiếu không làm corrupt cursor; lỗi có mã rõ.
- [ ] Không in secret vào DO/R2 theo denylist (credentialId thay password trong loop).
- [ ] Hạ tiếp hot cap → 512KB sau khi đo phân vị production.
- [ ] Offload I/O R2 riêng (không lakehouse).

---

## 9. Tóm tắt quyết định kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│  Execution run                                           │
│    │                                                     │
│    ├─► stateCore (UserDO)  — nhỏ, deterministic, resume │
│    │      cursor · slim outputs · loop refs · step meta  │
│    │                                                     │
│    └─► log blobs (R2, optional) — lớn, TTL, lazy UI     │
│           step I/O · final · loop items                  │
└─────────────────────────────────────────────────────────┘
         Truncation = priority policy, never lottery
         Too big after policy = degrade I/O, never wipe engine
```

**Phase 0 đủ để hết lỗi bất ổn.** Phase 1–2 tối ưu lưu trữ dài hạn mà không đánh đổi an toàn chạy.
