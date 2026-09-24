# Spec: An toàn hệ thống ở quy mô triệu user (Scale Safety)

> **Trạng thái:** Draft v1.1 — Phase A + Phase B implemented  
> **Phiên bản:** 1.2  
> **Ngày:** 2026-09-24  
> **Phạm vi:** Bảo vệ **ổn định, công bằng, chi phí kiểm soát được** khi nền tảng tăng tới hàng triệu user / hàng chục–trăm triệu sự kiện/ngày trên data-plane `UserDO → Queue → D1 → R2` và control-plane workflow (UserDO-local)  
> **Bổ sung, không thay thế:**  
> - Sức khoẻ luồng → [`admin-data-pipeline-health-spec.md`](./admin-data-pipeline-health-spec.md)  
> - FinOps Cloudflare → [`admin-cloudflare-usage-spec.md`](./admin-cloudflare-usage-spec.md)  
> - Inbox lỗi Worker → [`admin-cloudflare-logs-spec.md`](./admin-cloudflare-logs-spec.md)  
> - Persist/resume workflow → [`workflow-execution-logging-spec.md`](./workflow-execution-logging-spec.md)  
> - Credit / gói → [`business-model-one-credit-spec.md`](./business-model-one-credit-spec.md), [`subscription-packages-spec.md`](./subscription-packages-spec.md)  
> **Không thay thế:** Cloudflare Dashboard, Workers Paid plan limits, WAF/Bot Management zone

Nguyên tắc:

1. **Fail soft, không fail open nguy hiểm** — khi quá tải: từ chối / trì hoãn / degrade có chủ đích; không silent-drop billing (`service_usages`) hay silent-corrupt resume state.
2. **Blast radius theo user / table / stage** — một hot user hoặc một bảng không được đè toàn pipeline.
3. **Hot path nhỏ, cold path rẻ** — DO + Queue + D1 giữ nóng có trần; R2/lakehouse giữ lạnh có lifecycle.
4. **Quota trước khi bill cháy** — credit + rate-limit + retention + sampling observability đi cùng nhau.
5. **Ops nhìn thấy trước khi user cảm thấy** — pipeline-health + usage + logs đủ SLO; alert trước hard stop Cloudflare.
6. Coding bám spec. Mọi kill-switch / retention change phải **audit + confirm** (admin step-up).

---

## 0. Vì sao cần spec này

Pipeline health trả lời: “dữ liệu có đang chảy?”. Usage trả lời: “bao nhiêu USD Cloudflare?”. Spec này trả lời: **“hệ thống còn sống và công bằng khi traffic ×1000 không?”**

### 0.1 Giả định tải mục tiêu (planning envelope)

| Metric | Mục tiêu thiết kế (không phải cam kết marketing) |
|--------|--------------------------------------------------|
| Registered users | 1M–5M |
| MAU | 100k–1M |
| Peak concurrent WS / DO wake | 10k–50k |
| `service_usages` writes / ngày | 10M–100M |
| Workflow runs / ngày | 1M–20M |
| Queue messages / ngày | cùng bậc usages + catalog sync |
| D1 hot retention | ≤ 96 ngày (mặc định hiện tại); có thể hạ khi lakehouse tin cậy |
| R2 lakehouse | giữ lâu (năm), lifecycle IA sau 30–90 ngày nếu đọc ít |

Công thức thô:

```
usages/ngày ≈ MAU × calls/user/ngày
DO_storage_risk ≈ executions_kept × avg_state_bytes + pending_queue_rows
queue_ops/ngày ≈ messages × (1 + retries) × ~3 (CF queue accounting)
```

### 0.2 Bảng theo tiềm năng phình (SSOT ưu tiên bảo vệ)

| Tier | Bảng / store | Scale driver | Store hiện tại | Rủi ro triệu user |
|------|--------------|--------------|----------------|-------------------|
| **T1** | `service_usages` | mỗi API/AI call | DO→Q→D1→**R2** | Lag queue, D1 rows_read/storage, cron archive, credit correctness |
| **T1** | `workflow_executions` | mỗi workflow run | **DO-local** | DO SQLite size, alarm CPU, resume fail nếu clip sai |
| **T1** | `pending_messages` | notify / fan-out | DO→Q→D1 | Burst WS + DO write |
| **T2** | `sessions`, `connections` | login / device / WS | DO→Q→D1 | Tích nếu không expire |
| **T2** | `commissions`, `workflow_royalties` | gần theo usages | DO→Q→D1 (**chưa R2**) | D1 phình theo usages |
| **T2** | `orders`, `payments`, `refunds` | mua credit | DO→Q→D1→R2 | Ít hơn usages nhưng “nặng” tài chính |
| **T3** | catalog / auth (`users`, `agent_workflows`, `user_*`, …) | O(users) | DO→Q→D1 | Thấp volume; cao PII |
| **Out** | `workflow_credentials`, memory tables | secrets / agent | DO-local | Không sync; không được leak |

#### Cleanup: `order_items` / `order_discounts` (không còn dùng)

Rà soát code (2026-09-24): **không còn write/read path ứng dụng.** **Phase A đã gỡ** khỏi d1tor2 `PIPELINE_CONFIGS`, pipeline-health archive catalog + UI, Zod/DTO legacy; D1 `DROP TABLE IF EXISTS` khi queue-worker init.

| Store | Trạng thái sau Phase A | Việc còn lại (ops) |
|-------|------------------------|--------------------|
| **UserDO** | Không bao giờ có trong SYNC | Nếu DO cũ còn SQLite rác → drop khi migrate/cleanup DO (best-effort) |
| **D1** | `DROP IF EXISTS` trên init queue-worker | Xác nhận prod không còn table |
| **R2** | Không còn archive pipeline | Lifecycle/delete prefix lakehouse `order_items` / `order_discounts` (namespace `v011`) nếu đã từng archive |
| **Domain / web** | Đã xóa `OrderItem*` schemas | Order chỉ dùng bảng `orders` |

**Acceptance cleanup:** (1) không còn tên 2 bảng trong d1tor2 / pipeline-health archive list / admin actions — **done**; (2) D1 DROP trên init — **done**; (3) create/list order chỉ đụng `orders` / `payments` / `refunds` — **done**.

### 0.3 Chế độ hỏng điển hình ở scale (phải có countermeasure)

| Mode | Triệu chứng | Hậu quả |
|------|-------------|---------|
| **Queue backpressure** | depth ↑, DO `pending`/`flushed` ↑ | Lag billing/CRM; DO storage tăng |
| **Hot-user amplification** | 1 user flush oversized / retry storm | Chiếm batch queue-worker; DLQ |
| **D1 retention lag** | cron đỏ + storage ↑ | D1 overage / slow scan admin |
| **DO bloat** | executions + pending không prune | UserDO alarm timeout / storage error |
| **Retry amplify** | `MAX_RETRIES` + CF 3 ops/msg | Queues $ + CPU queue-worker |
| **Observability storm** | 100% logs sampling | `workers.logs_events` overage |
| **Credit bypass / abuse** | spam workflow / API | Margin âm + đè hạ tầng |
| **Thundering herd** | cron / mass reconnect / mass flush | Spike CPU auth + DO |

---

## 1. Mục tiêu / non-goals

### 1.1 Mục tiêu

1. Định nghĩa **SLO / error budget** data-plane và control-plane ở envelope triệu user.
2. Định nghĩa **trần cứng** (per-user, per-table, global) + **load shed** có thứ tự ưu tiên.
3. Bảo vệ đường **billing-critical** (`service_usages`, orders/payments) trước social/catalog.
4. Bảo vệ **DO storage** (đặc biệt `workflow_executions`) độc lập với D1/R2.
5. Kill-switches admin an toàn (pause ingest table, pause flush user, hạ retention) có audit.
6. Checklist go-live từng mốc (10k / 100k / 1M MAU) gắn màn usage + pipeline-health.
7. Phase code rõ; không “optimize mọi thứ” trong một PR.

### 1.2 Non-goals

- Không redesign multi-region / multi-D1 shard trong v1 (ghi roadmap §10).
- Không chuyển `workflow_executions` sang D1 (vẫn DO-local; offload blob theo execution-logging Phase 2).
- Không tự nâng Workers plan / đổi wrangler từ UI.
- Không FinOps pricing engine (đã có usage spec).
- Không chatbot LLM để quyết định shed (quyết định rule-based).

---

## 2. SLO và ngân sách lỗi

### 2.1 Data-plane (DO → Queue → D1 → R2)

| SLO | Mục tiêu (steady) | Watch | Incident |
|-----|-------------------|-------|----------|
| Flush lag P95 (pending → flushed) | ≤ 60s | > 5 phút | > 30 phút **hoặc** pendingΣ sample tăng 10×/1h |
| Consume lag P95 (flushed → D1, watermark) | ≤ 5 phút | > 30 phút | > 2 giờ **hoặc** DLQ logged > 0 sustained 15 phút |
| Archive freshness (D1 → R2 last success) | ≤ 36h sau cron window | > 48h | cron fail **hoặc** > 72h |
| DLQ new entries | 0 / giờ bình thường | ≥ 1 / giờ | ≥ 10 / giờ **hoặc** cùng fingerprint lặp |
| Force-path integrity | 0 silent billing drop | — | Phát hiện gap DO vs D1 cho `service_usages` (audit sample) |

Nguồn đo: pipeline-health overview + watermarks + cron runs + DLQ inbox (đã Phase 1–3).

### 2.2 Control-plane (UserDO workflow)

| SLO | Mục tiêu | Watch | Incident |
|-----|----------|-------|----------|
| Persist success (non-degraded) | ≥ 99.5% runs | `persistDegraded` ≥ 1% / 1h | ≥ 5% **hoặc** resume-fail spike |
| Execution prune | Mọi gói tôn `executionHistoryMax` / `Days` | UserDO storage proxy ↑ | Persist fail `SQLITE_FULL` / timeout alarm |
| HITL resume | 100% nếu run còn `pending_human` và stateCore còn | — | Bất kỳ stub `_truncated` trên state |

Nguồn: execution-logging flags + AE/logs `do.*` / workflow events (không kho log thứ hai).

### 2.3 Platform / Cloudflare envelope

| Signal | Watch | Hard action (manual/admin) |
|--------|-------|----------------------------|
| Workers requests / CPU projected overage | usage `watch` | Sampling logs; defer non-critical cron |
| Queues ops projected over | usage | Giảm retry; tăng batch; pause low-priority tables |
| D1 storage / rows_read | usage + retention rule | Hạ `D1_RETENTION_DAYS` **chỉ khi cron xanh** |
| DO duration | usage | Verify WS hibernation; giảm idle alarm |
| Workers AI neurons | usage | Cache gateway; chặn model đắt khi over |

Liên kết rule ids usage: `d1.retention_96`, `queue.retry_amplify`, `do.ws_duration`, `obs.unsampled`, `ai.neurons_daily`.

---

## 3. Chính sách ưu tiên khi quá tải (load shed order)

Khi bất kỳ stage ở `incident` hoặc CF projected overage ≥ 80% kỳ:

### 3.1 Thứ tự **giữ** (không shed)

1. Auth session hợp lệ / step-up admin  
2. Ghi `service_usages` (billing) — được **trì hoãn flush** nhưng **không** mất write trên DO  
3. `orders` / `payments` / `refunds`  
4. Resume / HITL đang mở (`workflow_executions` running)

### 3.2 Thứ tự **shed / trì hoãn** (có chủ đích)

| Priority | Hành động | Cách |
|----------|-----------|------|
| P1 | Giảm observability noise | `head_sampling_rate` queue/consumer/cron (usage rule `obs.unsampled`) |
| P2 | Pause sync bảng social | Tạm không flush `workflow_comments`, `workflow_user_stars` (flag KV) |
| P3 | Giảm AE / metrics density | Tăng `AE_BATCH_SIZE`, sample AE |
| P4 | Chậm catalog flush | Tăng `QUEUE_FLUSH_INTERVAL` cho non-T1 (nếu tách config) |
| P5 | Rate-limit workflow create/run per user | Plan limits + token bucket |
| P6 | Pause d1tor2 non-critical | Chỉ khi D1 CPU đỏ **và** lakehouse không cần gấp — **không** pause nếu retention sắp vỡ |
| P7 | Reject new non-paid heavy AI | Plan / credit gate (đã có credit model) |

**Cấm:** xóa `pending` billing để “nhẹ DO”; auto-replay toàn DLQ; hạ retention khi cron đỏ (`pipe.stab.retention_vs_fail`).

---

## 4. Trần cứng theo tầng

### 4.1 Per-user (UserDO)

| Limit | Giá trị đề xuất v1 | Ghi chú |
|-------|-------------------|---------|
| Pending rows / table (T1) | soft 2_000 / hard 10_000 | Hard → dừng accept write API với `429`/`503` + reason `backpressure` (trừ admin) |
| Pending rows / user (all sync) | soft 10_000 / hard 50_000 | Bảo vệ hot-user |
| Flush batch | `QUEUE_BATCH_SIZE` ≤ 100 (wrangler default); max system-config 1000 nhưng **prod recommend ≤ 200** | Oversized → `pullFromDo` (đã có) |
| Execution history | theo gói (`executionHistoryMax` 20…500) | Đã có Phase 3 logging spec — **bắt buộc enforce** |
| Execution state hot | `HOT_STATE_MAX_BYTES` / fail-closed | Không nới khi scale; offload R2 Phase 2 logging |
| Concurrent runs / user | theo gói | Chặn fan-out tự DoS |
| Sessions active | soft cap theo gói (vd 5–50) | Expire oldest |

### 4.2 Global queue / worker

| Limit | Đề xuất | Ghi chú |
|-------|---------|---------|
| `MAX_RETRIES` | ≤ 3 (default) | Không tăng khi quá tải |
| DLQ replay | ≤ 10 / admin / ngày | Đã Phase 3 pipeline-health |
| Force flush | 1 user / 5 phút | Đã có |
| DO probe admin | 30 / 5 phút / admin | Đã có |
| In-flight chunks queue-worker | tôn `BATCH_SIZE` + timeout `QUEUE_PROCESSING_TIMEOUT` | Fail → retry có bound |

### 4.3 D1 / R2

| Limit | Đề xuất | Ghi chú |
|-------|---------|---------|
| `D1_RETENTION_DAYS` | default 96; floor 30 khi lakehouse OK | Đổi qua system-config + audit |
| Archive tables | chỉ billing subset hiện tại | Thêm `commissions`/`royalties` → R2 **trước** khi D1 storage watch kéo dài |
| Cron concurrency | `PIPELINE_CONCURRENCY_LIMIT` hạ khi CPU đỏ | Usage rule `cpu.cron_d1tor2` |
| eKYC / version R2 | không đưa vào lakehouse path | Aux health riêng (Phase 3) |

### 4.4 Catalog bảng — quyết định archive

| Bảng | Ở 1M MAU | Quyết định safety |
|------|----------|-------------------|
| `service_usages`, `orders`, `payments`, `refunds` | Giữ E2E R2 | OK |
| `commissions`, `workflow_royalties` | D1 + **R2 archive (Phase B)** | OK — cùng retention `D1_RETENTION_DAYS` sau archive |
| Social stars/comments | Thấp hơn | Shed P2; có thể D1 TTL ngắn hoặc không sync nếu chỉ DO đủ |
| Catalog | O(users) | Giữ sync; không archive bắt buộc |

---

## 5. Bảo vệ UserDO (điểm nóng nhất)

### 5.1 Bắt buộc

1. **Prune `workflow_executions`** đúng gói mỗi `list`/`create` (đã spec) — thêm alarm periodic prune nếu user không mở UI lâu.
2. **Cleanup `processed`** trên `QUEUE_TABLE_NAMES` khi có pending (đã có) — mở rộng: alarm cleanup kể cả khi không pending nếu `processed` count > N.
3. **Expire `sessions` / `connections`** — job hoặc lazy revoke; không để triệu session zombie sync D1.
4. **Cap `pending_messages`** — drop oldest hoặc coalesce theo thread khi vượt soft cap (product quyết định UX).
5. **Oversized flush** — luôn `pullFromDo`; cấm gửi body > Queue limit (đã có path).
6. **Alarm budget** — một alarm cycle: flush + cleanup + workflow cron/continue phải kết thúc trong CPU budget; nếu không → chia việc (continuation alarm).

### 5.2 Cấm

- Sync `workflow_credentials` / memory tables ra Queue/D1.
- Giữ không giới hạn step I/O trên DO (phải clip / offload).
- `idFromName` scan toàn user từ admin tools.

### 5.3 Tín hiệu DO health ở scale

Pipeline-health sample ≤ 20 DO **không đủ** một mình ở 1M users. Bổ sung:

| Tín hiệu | Cách |
|----------|------|
| Hot users index | Đã có từ queue fail / DLQ / pull_fail |
| AE dimensions `table` + result | Sample; không per-message nếu AE gần cap |
| Storage proxy | Định kỳ (daily) probe top-N hot + random-N; lưu `pendingApprox` |
| Self-report | UserDO khi pending > soft: upsert `pipeline_hot_users` reason `pending_high` (best-effort, rate-limited 1/user/5m) |

---

## 6. Bảo vệ Queue → D1

1. **Parse fail / unknown table** → ack + DLQ metadata (đã có); incident `queue.dlq` / `parse_unknown_table`.
2. **Poison message** → không tăng `MAX_RETRIES` vô hạn; DLQ + hot user.
3. **Schema drift** — mọi bảng sync mới **bắt buộc** cập nhật đồng thời: UserDO `SYNC_TABLE_NAMES`, queue-worker list + D1 register, pipeline-health catalogs, spec inventory. CI check (Phase C).
4. **Watermark** — đã ghi `pipeline_watermarks`; alert nếu P50 lag > SLO watch.
5. **Fairness** — nếu 1 `userId` chiếm > X% messages trong cửa sổ: temporary slow-flush (tăng interval) cho user đó (Phase B).

---

## 7. Bảo vệ D1 → R2 và FinOps

1. Cron xanh là điều kiện tiên quyết trước khi hạ retention.
2. Index / query discipline trên `service_usages` (`created_at`, user scope) — tránh full scan admin.
3. Không dùng D1 làm kho log Worker hay raw queue body.
4. Lakehouse lifecycle → IA sau N ngày nếu query analytics chấp nhận (usage rule `r2.lakehouse_standard`).
5. Khi D1 storage `watch`: ưu tiên archive thêm T2 (`commissions`, `royalties`) hơn là xóa hot billing sớm.

---

## 8. Abuse, quota, công bằng

| Cơ chế | Vai trò scale |
|--------|----------------|
| Credit / plan limits | Trần AI & workflow trước hạ tầng |
| Turnstile / auth rate-limit | Đăng ký / login storm |
| Per-user API rate limit | Bảo vệ `service_usages` write storm |
| Concurrent workflow caps | Bảo vệ DO CPU |
| Admin step-up + audit | Force flush / replay / retention |
| WAF / Bot (zone) | Lớp ngoài — ngoài phạm vi Worker code |

**Fairness:** user trả phí không bị “noisy neighbor” miễn phí chiếm hết queue — slow-flush / reject run khi pending hard.

---

## 9. Kill-switches (admin)

Tất cả: `requireAdmin` + step-up + confirm + `pipeline_health_audit` (hoặc system-config audit).

| Switch | Effect | Default |
|--------|--------|---------|
| `sync.pause_tables` | UserDO skip flush listed tables | off |
| `sync.pause_user` | Skip flush 1 userId | off / TTL |
| `queue.drain_mode` | Consumer chỉ ack low-priority? (cẩn thận — v1 **không** ack-billing) | off |
| `d1tor2.pause` | Skip cron run (emergency) | off |
| `obs.sample_override` | Ép sampling logs | null = wrangler |
| `ai.heavy_models_block` | Chặn model đắt khi neurons đỏ | off |

v1 UI: có thể bắt đầu bằng KV + system-config fields; pipeline-health chỉ **đọc trạng thái + link**.

---

## 10. Roadmap phase

### Phase A — Guardrails đo & trần (S, ~1–2 PR)

- Document + enforce soft/hard pending caps trên write path T1 (ít nhất `service_usages` + workflow run create).
- UserDO self-report `pending_high` → `pipeline_hot_users`.
- Alarm prune executions định kỳ + cleanup processed khi vượt N dù không pending.
- Session/connection expire policy (lazy hoặc cron-lite).
- **Cleanup dead tables:** gỡ `order_items` / `order_discounts` khỏi d1tor2 `PIPELINE_CONFIGS`, pipeline-health `PIPELINE_ARCHIVE_TABLES` + UI; DROP trên D1 nếu còn; xóa Zod/DTO legacy; lifecycle R2 prefix nếu đã archive (§0.2).
- Checklist mốc 10k MAU (mục §11).
- Cross-link spec này từ pipeline-health + usage.

### Phase B — Backpressure & archive T2 (M) — **implemented**

- Slow-flush per hot user (`SLOW_FLUSH_*` trên UserDO khi soft exceed / `pending_high`).
- KV `sync.pause_tables` / `sync.pause_user:{id}` + audit; UserDO skip flush (force flush vẫn chạy); UI pipeline-health **read-only** status + admin API pause/resume.
- Archive `commissions` + `workflow_royalties` → R2 (d1tor2 `PIPELINE_CONFIGS` + `PIPELINE_ARCHIVE_TABLES`) — **đã chọn archive**, không dùng retention riêng.
- Fairness workflow run: hard → `BACKPRESSURE`; soft → `BACKPRESSURE_SOFT` throttle (`WORKFLOW_SOFT_THROTTLE_MS`).
- CI: `npm run check:sync-tables` (`scripts/check-sync-tables.mjs`).

**Ops sau deploy:** tạo Cloudflare Pipelines streams/sinks cho `commissions` / `workflow_royalties` nếu chưa có (`pnpm --filter @api-services/pipelines create-pipelines` hoặc d1tor2 auto-create path).

### Phase C — Multi-tenant sẵn sàng 1M (L)

- Queue partition / consumer concurrency review (Cloudflare limits).
- DO storage telemetry dashboard (top offenders).
- Execution blob offload Phase 2 (execution-logging) bắt buộc trước khi nới history Max.
- Đánh giá tách D1 read-replica / analytics-only (R2/Iceberg) cho admin scan lớn.
- Chaos drill: DLQ inject, cron fail, pause table — runbook gắn pipeline-health.

### Phase D — Roadmap (không commit)

- Multi-D1 / tenant shard.
- Regional DO.
- Auto-shed controller (rule engine đọc overview + usage).

---

## 11. Checklist go-live theo mốc

### 11.1 Trước 10k MAU (hiện tại → gần)

- [ ] Pipeline-health Phase 1–3 deployed; admin biết DLQ + watermark + aux R2
- [ ] Cloudflare usage rules `d1.retention_96`, `queue.retry_amplify`, `obs.unsampled` đã review
- [ ] Execution history prune theo gói bật
- [ ] `D1_RETENTION_DAYS` và cron xanh xác nhận 7 ngày liên tiếp
- [ ] Không unknown_table trong logs 7 ngày

### 11.2 Trước 100k MAU

- [ ] Phase A xong (pending caps + self-report hot users)
- [ ] Sampling logs trên worker không-auth
- [ ] Load test: flush `service_usages` tại 10× peak hiện tại; watermark P95 trong SLO
- [ ] Runbook: cron đỏ + D1 storage (không hạ retention)
- [ ] Quyết định archive T2 (commissions/royalties)

### 11.3 Trước 1M MAU

- [ ] Phase B xong
- [ ] Execution R2 offload (logging Phase 2) hoặc history Max giữ thấp
- [ ] Chaos drill §10 Phase C tối thiểu 1 lần
- [ ] Budget Cloudflare projected ổn định 2 kỳ billing
- [ ] On-call: alert pipeline `overall=incident` + usage projected_over

---

## 12. Quan sát & alert (tái dùng, không kho mới)

| Nguồn | Dùng cho scale safety |
|-------|----------------------|
| `/dashboard/pipeline-health` | SLO data-plane, DLQ, hot users, watermark |
| `/dashboard/cloudflare-usage` | Envelope $ / included |
| `/dashboard/cloudflare-logs` | Burst exception |
| `/dashboard/system-config` | BATCH / retention / flush knobs |
| In-app burst alert (pipeline) | overall incident |
| (Phase B) alert khi `pending_high` users > N | noisy neighbor |

**Cấm** Logpush raw queue body / full DO dump.

---

## 13. Bảo mật & compliance ở scale

- Redaction giữ nguyên pipeline-health / logs specs.
- eKYC ảnh chỉ `R2_EKYC_BUCKET`; không lakehouse.
- Admin actions rate-limit + audit.
- PII catalog tables: sync cần thiết nhưng **không** nhân bản sang analytics rộng hơn cần.
- Secrets chỉ DO (`workflow_credentials`).

---

## 14. File sẽ đụng khi code (Phase A gợi ý)

| Area | File |
|------|------|
| Pending caps / self-report | `workers/auth-worker/src/features/ws/infrastructure/UserDO.ts` |
| Write gates usages / workflow | billing settle + workflows api presentation |
| Hot users | queue-worker + UserDO upsert (đã có pattern) |
| Session expire | sessions infrastructure / UserDO |
| Config knobs | `system-config/domain.ts` + KV |
| CI catalog sync | script so sánh 3 list `SYNC_TABLE_NAMES` |
| Docs | spec này; link từ pipeline-health + usage |

---

## 15. Tiêu chí chấp nhận (Definition of Done theo phase)

### Phase A

1. Soft/hard pending documented trong code constants; hard trả lỗi rõ `backpressure` trên ít nhất 1 T1 write path.
2. UserDO pending_high xuất hiện trên pipeline-health hot users khi vượt soft.
3. Processed cleanup chạy khi count > N dù không pending.
4. Unit/integration tests caps + prune.
5. Spec cross-linked.

### Phase B

1. Pause table/user KV có audit; UserDO tôn flag.
2. T2 archive **hoặc** retention riêng — chọn 1 và ghi trong inventory.
3. CI fail nếu SYNC lists lệch.
4. Slow-flush hot user có test.

### Phase C

1. Chaos drill note trong runbook pipeline-health.
2. DO top-offenders visible admin.
3. Execution offload hoặc chứng minh history Max đủ cho 1M envelope.

---

## 16. Tóm tắt một dòng

**An toàn triệu user = trần per-user + shed có thứ tự + DO không phình + billing không mất + D1/R2 retention chỉ khi cron xanh + đo bằng pipeline-health/usage trước khi Cloudflare hard-stop.**
