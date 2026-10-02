# Spec: Admin — log AI Gateway của một workflow execution

> **Trạng thái:** Draft v1.0 — sẵn sàng code  
> **Phiên bản:** 1.0  
> **Ngày:** 2026-10-02  
> **Phạm vi:** Màn admin nội bộ, mở từ một `executionKey`, xem **đúng các log AI Gateway `unitoken` mà lần chạy đó đã sinh** — bảng + inspector request/response theo bố cục dashboard Cloudflare (ảnh tham chiếu 2026-10-02)  
> **Bổ sung, không thay thế:** fan-out Credit theo run → `/dashboard/workflow-execution-usages` ([`scale-safety-million-users-spec.md`](./scale-safety-million-users-spec.md) §B.1); lỗi Worker → [`admin-cloudflare-logs-spec.md`](./admin-cloudflare-logs-spec.md); FinOps → [`admin-cloudflare-usage-spec.md`](./admin-cloudflare-usage-spec.md); snapshot resume → [`workflow-execution-logging-spec.md`](./workflow-execution-logging-spec.md)  
> **Không thay thế:** Cloudflare Dashboard → AI Gateway → `unitoken` → Logs

Nguyên tắc giữ từ spec Credit / Cloudflare logs:

- Khách hàng **không** thấy màn này, không thấy prompt/response của người khác, không thấy USD neuron của Cloudflare như line-item bán ra.
- Màn này là **điều tra nội bộ**: execution đã gọi model nào, cache hay không, bao nhiêu token, body request/response Cloudflare đã lưu.
- **SSOT raw log = AI Gateway.** Hub không copy `request_head` / `response_head` sang D1, R2, KV.

Coding bám spec này. **Không** nhúng API token Cloudflare vào browser. Client chỉ nhận DTO đã redact secret.

---

## 0. Hiện trạng và bất cập phải vá

Gateway id cố định `unitoken` (`HUB_WRANGLER_FACTS.aiGatewayId`). Mọi `env.AI.run` trên đường workflow đi qua `WORKERS_AI_GATEWAY`:

```ts
{ id: 'unitoken', retries: { maxAttempts: 3, retryDelayMs: 400, backoff: 'exponential' } }
```

File: [`workers-ai.ts`](../workers/auth-worker/src/features/member/workflows/ai/workers-ai.ts).

Object này **không** có `eventId`, **không** có `metadata`. Dashboard Cloudflare vì vậy chỉ có danh sách trộn mọi request (embed, GLM, cache hit, eKYC, assistant). Không có khóa nào để hỏi “execution `…` đã sinh những dòng nào”.

| Cần thấy | Hiện có |
|----------|---------|
| Mọi log gateway của **một** execution | Không. Phải đoán theo giờ trên dashboard |
| Model, token in/out, cost, duration, cached | Có trên Cloudflare, không gắn run |
| Request JSON + response JSON (kể cả vector embed) | Có trên Cloudflare khi mở 1 dòng; Hub không proxy |
| Retry gateway (`step`) và retry capacity (`withAiCapacityRetry`) thành nhiều dòng | Có trên CF, UI Hub không gom theo run |
| Execution tạo **trước** khi đóng dấu | Không join được. Cấm ghép theo cửa sổ thời gian rồi gắn nhãn “log của execution này” |

`service_usages.executionKey` (màn Execution Usages) đo **Credit đã charge**, không phải log gateway. Một lần `AI.run` có thể: charge 1 usage, sinh 1–3 log gateway (retry), hoặc cache hit `$0` vẫn là một dòng log. Hai số không bằng nhau — UI không được gộp.

Gateway `unitoken` tạo **trước** 2026-09-24 → **Legacy Logs** ([Logging](https://developers.cloudflare.com/ai-gateway/observability/logging/), cập nhật 2026-09-24). Khách gateway mới từ ngày đó dùng Workers Logs (giá + retention 7 ngày). Spec này **không** giả retention 7 ngày cho `unitoken`. Hết hạn phía Cloudflare thì detail trả 404, UI nói “log không còn trên gateway”, không bịa body.

### 0.1 Đường gọi AI trong execution (bắt buộc đóng dấu)

| Chỗ | Việc | `kind` |
|------|------|--------|
| [`billing.ts`](../workers/auth-worker/src/features/member/workflows/billing/billing.ts) `runTextModel` | Chat / SQL / mô tả bảng / rewrite câu | `text` |
| Cùng hàm, nhánh `prompt: 'agree'` (lỗi 5016) | Probe bật model | `agree` |
| [`rag-vector.ts`](../workers/auth-worker/src/features/member/workflows/rag/rag-vector.ts) `runEmbed` | Embed `@cf/baai/bge-m3` (ảnh: `pooling`, `shape`, `data`) | `embed` |
| [`agent/execute.ts`](../workers/auth-worker/src/features/member/workflows/nodes/agent/execute.ts) `createWorkersAI` + `generateText` | Tool loop, mỗi step là một request gateway | `agent` |
| [`execute-reasoning.ts`](../workers/auth-worker/src/features/member/workflows/nodes/agent/execute-reasoning.ts) | Reasoning agent | `agent` |

Ngoài execution — **không** gắn `eventId` của một run (giữ `WORKERS_AI_GATEWAY` trần):

| Chỗ | Lý do loại |
|------|------------|
| [`assistant/agent.ts`](../workers/auth-worker/src/features/assistant/agent.ts) | Chat trợ lý, không có execution |
| [`ekyc/infrastructure.ts`](../workers/auth-worker/src/features/member/ekyc/infrastructure.ts) | Ảnh định danh |
| [`collab/ai-authoring.ts`](../workers/auth-worker/src/features/member/workflows/collab/ai-authoring.ts), [`workflow-chat.ts`](../workers/auth-worker/src/features/member/workflows/collab/workflow-chat.ts) | Soạn workflow, không phải một lần chạy |

### 0.2 Quyết định vá (bắt buộc khi code)

1. Màn **admin-only**, step-up, cùng họ Execution Usages / Worker errors. Member: sidebar ẩn, URL redirect, API 403.
2. Browser **không** gọi `api.cloudflare.com`. Auth-worker proxy bằng token Secrets Store.
3. Khóa join = `eventId` trên gateway **bằng** `executionKey` (`crypto.randomUUID()`, 36 ký tự). Filter list: `event_id` `eq` executionKey. Metadata `executionKey` là bản sao để lọc trên dashboard Cloudflare khi không có Hub.
4. **Cấm** dùng `env.AI.aiGatewayLogId` làm SSOT. Field nằm trên binding, lệch khi nhiều `AI.run` chồng trong một isolate (embed batch, tool loop). Đọc được thì chỉ là gợi ý, không ghi vào DO để “thay” filter.
5. **Cấm** kho log thứ hai: không bảng D1 body, không R2 payload, không KV cache `request_head` / `response_head`. List metadata (id, model, token, cost, cached) cache KV tối đa 20 giây.
6. List API **không** có body. Inspector gọi `GET .../logs/{id}` chỉ khi admin chọn dòng.
7. Execution chưa đóng dấu → `link: "unstamped"`, bảng rỗng, copy giải thích. **Không** fallback “log cùng giờ”.
8. Prompt và completion **là** nội dung điều tra — hiện cho admin. Redact field secret lồng trong JSON (mục 9). Không redact cả prompt chỉ vì nó dài.
9. Token: `AI Gateway Read`. Tái dùng `CLOUDFLARE_USAGE_API_TOKEN` **chỉ khi** scope đã có quyền đó. Thiếu quyền → 503 `ai_gateway_unreadable`, không `{ logs: [] }` giả “execution không gọi AI”. **Không** dùng `CF_AI_API_TOKEN` (token suy luận). Không AI Gateway Write (không `patchLog`, không sửa Settings gateway).
10. Một execution nhiều request (chunk embed, step agent, retry). UI liệt kê **từng** log, không gộp thành một dòng.

---

## 1. Mục tiêu / non-goals

### 1.1 Mục tiêu

Admin dán hoặc bấm vào một `executionKey` và thấy:

1. **Danh tính run** — workflow id/tên, status, bắt đầu/kết thúc, chủ sở hữu đã hash (không email).
2. **Bảng log** cùng cột dashboard Cloudflare: Time, Status, Model, Usage, Cost, Duration, User Agent. Phân trang 24 dòng (“Showing 1–24 of N”).
3. **Inspector** khi chọn một dòng: provider + model, cost, duration, Request JSON | Response JSON, HTTP status, Endpoint, Type, User Agent.
4. **Tóm tắt run** — số log, tổng cost, tổng token in/out, số cache hit, số lỗi (cộng trên các trang, trần 240 dòng).
5. **Live** — poll danh sách khi admin bật, hoặc khi run còn `running`.

### 1.2 Non-goals

- Sửa cache / guardrail / DLP / authentication của gateway.
- Feedback `patchLog` (thumbs).
- Hiện log eKYC, assistant, authoring trong ngữ cảnh execution.
- Thay Execution Usages (Credit) hoặc Worker errors (Observability).
- Member tự xem log gateway của run của họ (sản phẩm khác, nếu có sau này).
- Copy payload về Hub “để còn xem sau khi Cloudflare xóa”.
- Ghép log theo thời gian khi thiếu `eventId`.
- Explorer mọi log gateway không gắn execution — **phase 2**, tab riêng, nhãn khác, không đứng trong bảng của một execution.

---

## 2. Đóng dấu request (làm trước UI)

### 2.1 Hợp đồng

```ts
type AiCallKind = 'text' | 'embed' | 'agent' | 'agree';

type AiCallStamp = {
  executionKey: string; // UUID
  workflowId: string;   // số, dạng chuỗi
  nodeId: string;       // rỗng chỉ khi không có node (không bịa id)
  kind: AiCallKind;
};

function gatewayForExecution(stamp: AiCallStamp): GatewayOptions {
  return {
    id: 'unitoken',
    retries: { maxAttempts: 3, retryDelayMs: 400, backoff: 'exponential' },
    eventId: stamp.executionKey,
    metadata: {
      executionKey: stamp.executionKey,
      workflowId: stamp.workflowId,
      nodeId: stamp.nodeId,
      kind: stamp.kind,
    },
  };
}
```

Đúng **4** key metadata. Trần Cloudflare là 5; key thứ 5 có thể bị đẩy ra bởi `cf.user_id` ([Custom metadata](https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/)). Không thêm `owner`, email, prompt, connection string.

`eventId` không chiếm slot metadata. Retry do gateway (`step` ≥ 1) giữ cùng `eventId` — chúng phải hiện cùng execution.

`runTextModel(env, model, messages, maxTokens, extra, stamp?)` và `runEmbed(...)` nhận `stamp`. Đường node **bắt buộc** truyền. Thiếu `executionKey` trên đường đó → không gọi AI (fail closed ở helper), không gửi request “mồ côi” rồi để admin không tìm thấy. Test đơn vị không đi qua execution được phép gọi helper không stamp; production node thì không.

Nhánh `agree`: cùng stamp, `kind: 'agree'`.

`createWorkersAI({ binding, gateway })` nhận `gatewayForExecution({ ...stamp, kind: 'agent' })`, không nhận object trần.

### 2.2 Những gì không ghi thêm vào DO

Không cột mới `ai_gateway_log_ids` trên `workflow_executions`. Join xảy ra lúc admin mở màn, bằng filter `event_id`. Snapshot resume không phình vì log id.

---

## 3. API Cloudflare (adapter)

Nguồn 2026-10: [List logs](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/logs/methods/list/), [Get log](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/logs/methods/get/), [Logging](https://developers.cloudflare.com/ai-gateway/observability/logging/).

Gateway id: `unitoken`. Account: `ACCOUNT_ID` đã có trên auth-worker. Không hard-code account id trong UI.

### 3.1 List

```
GET /accounts/{account_id}/ai-gateway/gateways/unitoken/logs
```

Query Hub luôn gửi:

```json
{
  "filters": [
    { "key": "event_id", "operator": "eq", "value": ["<executionKey>"] }
  ],
  "order_by": "created_at",
  "order_by_direction": "desc",
  "page": 1,
  "per_page": 24,
  "meta_info": true
}
```

Filter thêm (AND, cùng mảng): `success`, `cached`, `model`. Ô search của UI map sang query `search` của API (full-text metadata) — **không** thay filter `event_id`. Bỏ `event_id` là cấm ở handler execution.

`per_page` tối đa phía CF là 50. Hub cố định 24 để khớp “Showing 1–24 of N” trên dashboard.

List **không** trả `request_head` / `response_head`. Đừng mong body ở endpoint này.

`result_info.total_count` = tổng dòng của filter, dùng cho phân trang. `result_info` có min/max cost và token, **không** có tổng. Tổng cost/token: server lật trang đến hết hoặc đến 240 dòng (10 × 24), field `summaryTruncated: true` nếu `total_count` lớn hơn. Không lật quá 10 trang trong một request overview.

### 3.2 Detail

```
GET /accounts/{account_id}/ai-gateway/gateways/unitoken/logs/{id}
```

Trả thêm `request_head`, `request_head_complete`, `request_size`, `response_head`, `response_head_complete`, `response_size`, `status_code`, `path`, `request_type`, `metadata`, `step`.

Trước khi trả client: parse JSON nếu được; redact mục 9; nếu `*_head_complete === false` thì DTO `truncated: true`. Embed `data` hàng nghìn float: server **không** cắt số (admin cần đối chiếu), client mới collapse hiển thị (mục 5). Trần response Hub: nếu chuỗi head > 1_500_000 ký tự, cắt và `truncated: true` — chống Worker OOM, không phải “làm đẹp”.

Detail từ chối log **không** thuộc execution đang mở: metadata không chứa `executionKey` đó **và** (khi list cùng id không khớp filter event). Cách làm: detail chỉ được gọi sau list; handler detail gửi kèm `executionKey` và kiểm tra `metadata` parse ra có `executionKey` khớp. Metadata thiếu (log lạ) → 404. Không biến màn execution thành đầu đọc mọi log id trên account.

### 3.3 Lỗi adapter

| CF | Hub |
|----|-----|
| 401 / 403 token | 503 `ai_gateway_unreadable` |
| 404 log | 404 `log_gone` |
| 429 | 429, UI giữ bảng cũ |
| Field lạ trên một dòng | bỏ qua dòng đó, không 500 cả trang |

---

## 4. Mô hình DTO

```ts
type GatewayLogStatus = 'success' | 'cached' | 'error';

type GatewayLogRow = {
  id: string;
  createdAt: string;          // ISO từ CF
  status: GatewayLogStatus;   // success && !cached | cached | !success
  provider: string;           // "workers-ai" → nhãn "Workers AI"
  model: string;              // "@cf/baai/bge-m3"
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;     // số CF trả, không nhân hệ số Credit
  durationMs: number;
  userAgent: string | null;
  cached: boolean;
  success: boolean;
  httpStatus: number | null;
  step: number | null;        // retry gateway
  kind: string | null;        // metadata.kind
  nodeId: string | null;
};

type GatewayLogDetail = GatewayLogRow & {
  endpoint: string;           // path
  requestType: string | null;
  request: unknown;           // JSON đã redact, hoặc string nếu không parse
  response: unknown;
  requestTruncated: boolean;
  responseTruncated: boolean;
  metadata: Record<string, string | number | boolean | null>;
};

type ExecutionGatewayReport = {
  link: 'stamped' | 'unstamped' | 'unavailable';
  execution: {
    executionKey: string;
    workflowId: number | null;
    workflowName: string | null;
    status: string | null;
    startedAt: number | null;
    finishedAt: number | null;
    ownerHash: string | null;
  } | null;
  summary: {
    logCount: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    cached: number;
    errors: number;
    truncated: boolean;
  } | null;
  logs: GatewayLogRow[];
  page: number;
  perPage: 24;
  totalCount: number;
};
```

`status`:

| Điều kiện | Chấm | Ý nghĩa trên ảnh |
|-----------|------|------------------|
| `success && cached` | xanh dương | Dòng ~9–16 ms, cost 0, usage `— in · — out` |
| `success && !cached` | xanh lá | Suy luận thật (GLM có token, bge-m3 có cost nhỏ) |
| `!success` | đỏ | Lỗi gateway / provider |

Không suy màu từ cost. Cost âm hoặc null: hiện đúng số hoặc `—`, không đổi dấu.

Header execution đọc ledger admin đã có cho Execution Usages (cùng nguồn). Ledger thiếu (run quá cũ / chưa sync) vẫn cho xem log nếu filter `event_id` có dòng; card execution = `unknown`, không chặn bảng.

`link: "unstamped"` khi execution tồn tại, `startedAt` trước thời điểm deploy đóng dấu (hằng số `AI_GATEWAY_STAMP_EPOCH_MS` trong code, set lúc ship), **và** trang 1 trả 0 dòng. Execution sau epoch mà 0 dòng = run không gọi AI (`link: "stamped"`, empty thật).

---

## 5. Màn hình UI

Bám ảnh dashboard `unitoken` → Logs: hàng filter, bảng, chọn một dòng thì inspector request/response ngay bên dưới dòng được chọn (dòng đó vẫn highlight). Không mở route mới cho từng log.

### 5.1 Chỗ gắn

| Hạng mục | Giá trị |
|----------|---------|
| Route | `/dashboard/ai-gateway-logs` |
| Query | `?executionKey=` bắt buộc để có bảng. Không có key → ô nhập + danh sách execution gần đây (cùng API recent của Execution Usages) |
| Sidebar | Platform, **sau** Worker errors. `adminOnly: true`. Icon `Sparkles` |
| i18n | `AiGatewayLogsAdmin` trong `en-US.json` / `vi-VN.json` |
| Guard | `useRequireAdmin` + prefix trong `ADMIN_MANAGEMENT_PREFIXES` |
| Step-up | có |

Liên kết vào, chỉ admin:

- Execution Usages: nút “Log AI Gateway” trên report đang mở → route + `executionKey`.
- Workspace execution (`workflow-execution-workspace`): nút cùng tên **chỉ khi** `role=admin`. Member không thấy nút.

Link ra: “Credit của execution này” → Execution Usages cùng key. “Mở trên Cloudflare” → `https://dash.cloudflare.com/{accountId}/ai/ai-gateway/gateways/unitoken/logs` (account id lấy từ DTO, không hard-code trong bundle nếu DTO đã có; được phép hằng số account đã public trong wrangler). Deep link CF **không** lọc sẵn theo event — nút là lối thoát, bảng Hub mới là nguồn đã lọc.

### 5.2 Header

- Title VI: “Log AI Gateway”. EN: “AI Gateway logs”.
- Sub: `unitoken` · execution `{key}` · `{workflowName}` · status · `{started}`–`{finished}` (giờ `Asia/Ho_Chi_Minh`, cùng kiểu `2026-10-02 11:30:40 GMT+7` trên ảnh).
- Chip: `{n} logs` · cost USD · token in/out · `{n} cached` · `{n} errors`. `summaryTruncated` thì thêm “tổng tính trên 240 dòng đầu”.
- Refresh.
- **Live**: toggle. Bật thì poll list mỗi 10 giây, tối đa 5 phút rồi tự tắt. Run `running` gợi ý bật, không tự bật. Đổi trang hoặc filter thì không reset inspector nếu `id` còn trong trang mới; mất id thì đóng inspector.
- Không có preset “Last 24 hours” trên tab execution. Cửa sổ là **mọi log mang event id này**, không cắt theo giờ (retry sát biên giờ vẫn thuộc run). Tab phase 2 mới có preset giờ.

### 5.3 Filter (hàng trên bảng, giống ảnh)

- Status: tất cả / success / error
- Cache: tất cả / cached / không cache
- Model: text, gửi khi admin nhập (không tải catalog model)
- Search: `search` API
- “No filters applied” khi cả ba đang mặc định
- Nút xóa filter. Không nút “Add” tùy ý field — đủ bốn control, tránh UI filter-builder trùng dashboard mà không cần.

### 5.4 Bảng

Cột, đúng thứ tự ảnh:

1. **Time** — `YYYY-MM-DD HH:mm:ss` + `GMT+7`
2. **Status** — chấm màu mục 4
3. **Model** — `@cf/...`
4. **Usage** — `{tokensIn} in · {tokensOut} out`; null → `— in · — out`
5. **Cost** — USD, tối đa 8 chữ số thập phân (`$0.00000055`). Null → `—`
6. **Duration** — `{n} ms`
7. **User Agent** — chuỗi hoặc `—`

Dòng phụ nhỏ (không thêm cột): `kind` + `nodeId` rút gọn, và `step` nếu > 0 (“retry {step}”).

Footer: `Showing {from}–{to} of {totalCount}`. Phân trang số, không infinite scroll.

Empty `stamped`: “Execution này không có log gateway.”  
Empty `unstamped`: “Lần chạy này diễn ra trước khi Hub gắn execution vào AI Gateway. Không thể đối chiếu. Log vẫn nằm trên Cloudflare, không lọc theo execution được.”  
`unavailable`: banner lỗi token, không bảng rỗng im lặng.

### 5.5 Inspector (ảnh thứ hai)

Mở dưới dòng đang chọn. Một dòng tại một thời điểm.

- Tiêu đề: `{Provider label} / {model}` — `workers-ai` hiện **Workers AI**.
- Cost, Duration, cùng format bảng.
- Nút Copy log id. Không nút Share Cloudflare (đã có ở header).
- Hai cột ngang từ breakpoint `lg`, xếp dọc khi hẹp:
  - **Request** — “Filter JSON” lọc **client** trên cây đã tải (không gọi lại API).
  - **Response · HTTP {status}** — cùng ô lọc riêng.
- Pretty-print JSON. Mảng số dài hơn 32 phần tử (vector embed): hiện 8 số đầu + “{n} values”, nút “Hiện đầy đủ” trên pane đó.
- `truncated`: banner “Cloudflare chỉ lưu một phần payload.”
- Footer 3 ô: **Endpoint** (`path`), **Type** (`request_type`, ví dụ Workers AI binding), **User Agent**.

Đang tải detail: skeleton hai pane, bảng không nháy. Lỗi detail: pane báo `log_gone` hoặc lỗi mạng, bảng giữ nguyên.

### 5.6 Phase 2 — tab “Mọi log gateway”

Không ship trong phase 1. Khi làm: tab thứ hai, preset 1h / 24h / 7d, Live, **không** filter `event_id`, nhãn “Không gắn với một execution”. Cùng component bảng + inspector. Vẫn admin, vẫn không persist body. Phase 1 không để route list-all kẻo admin tưởng đó là log của run.

---

## 6. API Hub

Mount cạnh billing admin, `requireAdmin` mọi route.

| Method | Path | Việc |
|--------|------|------|
| `GET` | `/dashboard/admin/ai-gateway/executions/:executionKey/logs?page=&success=&cached=&model=&search=` | Report mục 4. `page` default 1 |
| `GET` | `/dashboard/admin/ai-gateway/executions/:executionKey/logs/:logId` | Detail. 404 nếu metadata execution không khớp |

`:executionKey` phải là UUID. Khác UUID → 400, không forward sang Cloudflare (chặn search injection / quét).

Không `POST`. Không endpoint list-all ở phase 1.

KV: `ai-gateway-exec-logs:{executionKey}:{filterHash}:{page}` TTL 20 giây, **chỉ** DTO hàng bảng + summary số. Không cache detail.

Rate limit: 30 list/phút/admin, 60 detail/phút/admin. Vượt → 429.

---

## 7. Bảo mật

- `requireAdmin` + step-up.
- Redact trên `request` / `response` / metadata trước khi JSON ra client. Key khớp (không phân biệt hoa thường), kể cả lồng nhau: `authorization`, `api_key`, `apiKey`, `token`, `secret`, `password`, `cookie`, `connectionString`, `private_key`. Giá trị → `[REDACTED]`. Không đụng key `text` / `messages` / `data` (đó là prompt và vector).
- Không `console.log` head. Logger Hub nếu ghi lỗi adapter thì chỉ status CF + executionKey, không body.
- Detail không chấp nhận log id ngoài execution (mục 3.2).
- Member và tool assistant không được trỏ sang hai route này.
- Response không echo token, không echo body lỗi CF nếu body đó chứa credential.

Prompt khách hàng sẽ hiện trên màn admin. Đó là mục đích điều tra. Không thêm export CSV/JSON hàng loạt ở v1 (một nút copy log id là đủ; tải full embed hàng trăm dòng là lộ dữ liệu không cần).

---

## 8. Liên hệ màn khác

| Màn | Ranh giới |
|-----|-----------|
| Execution Usages | Credit / `service_usages` theo `executionKey`. Có thể 1 usage ↔ nhiều log (retry) hoặc log cache `$0` không charge. Không suy ra số kia từ số này |
| Worker errors | Exception Worker, không phải request model |
| Cloudflare usage | Neuron / overage account. Cost trên màn này là cost **từng request gateway**, không phải hóa đơn |
| Workspace execution | I/O node đã clip trong DO. Gateway giữ body đầy hơn (cho đến khi CF xóa). Hai nơi không đồng bộ từng byte |
| Monitor Logs member | Không thêm gateway log vào nhật ký member |

---

## 9. Phases

### Phase 1 — đóng dấu + màn execution

- `gatewayForExecution` và luồng mục 0.1 truyền stamp. Đường ngoài execution không đổi.
- Hai route mục 6, redact, UUID check, 503 fail-closed.
- UI mục 5.1–5.5, link từ Execution Usages và workspace (admin).
- `AI_GATEWAY_STAMP_EPOCH_MS` = thời điểm deploy. Run trước đó + 0 log → `unstamped`.
- Không tab “mọi log”. Không persist body. Không `patchLog`.

### Phase 2 — explorer gateway

- Tab mọi log, preset thời gian, cùng inspector.
- Vẫn không kho lưu Hub.

---

## 10. File sẽ đụng khi code

Backend (`auth-worker`):

- `src/features/member/workflows/ai/workers-ai.ts` — `gatewayForExecution`, `AiCallStamp`
- `billing.ts` `runTextModel` (+ nhánh agree), `rag-vector.ts` `runEmbed`
- `nodes/agent/execute.ts`, `nodes/agent/execute-reasoning.ts`
- Call site `runTextModel` / `embedText` trong save-rag, save-sql-pair, get-rag — truyền stamp từ `ctx.executionKey` / `ctx.node.id` / workflow id
- `src/features/admin/ai-gateway-logs/client.ts` — list + get
- `src/features/admin/ai-gateway-logs/redact.ts`
- `src/features/admin/ai-gateway-logs/presentation.ts`
- `src/features/admin/ai-gateway-logs/*.test.ts`
- `src/index.ts` — mount
- `wrangler.jsonc` — ghi chú quyền AI Gateway Read trên token usage (không secret mới nếu token cũ đủ scope)

Không migration D1. Không sửa schema `workflow_executions`.

Frontend (`web`):

- `src/app/(main)/dashboard/ai-gateway-logs/page.tsx`
- `_components/` filters, table, inspector
- `sidebar-items.ts`, `sensitive-step-up.ts`
- `messages/en-US.json`, `vi-VN.json` — `AiGatewayLogsAdmin`
- Nút trên `workflow-execution-usages/page.tsx` và `workflow-execution-workspace.tsx` (admin)

---

## 11. Test plan

### 11.1 Đơn vị

- [ ] `gatewayForExecution` đặt `eventId` = executionKey và đúng 4 metadata key, `kind` đổi theo call
- [ ] Metadata không chứa email, `authorization`, chuỗi prompt
- [ ] `runTextModel` khi có stamp: request đi `gatewayForExecution`; nhánh agree dùng `kind: 'agree'` cùng executionKey
- [ ] `runEmbed` tương tự, `kind: 'embed'`
- [ ] Execution key không phải UUID → 400, client CF không bị gọi
- [ ] List luôn có filter `event_id` eq; search thêm không xóa filter đó
- [ ] Detail metadata `executionKey` khác param → 404
- [ ] Redact `apiKey` lồng trong `messages` không xóa nội dung `content` bên cạnh
- [ ] `success && cached` → `status: 'cached'`; HTTP lỗi → `error`
- [ ] Token 403 → `ai_gateway_unreadable`, không `logs: []` với `link: 'stamped'`
- [ ] Started trước epoch + 0 dòng → `unstamped`
- [ ] Started sau epoch + 0 dòng → `stamped` và `logs: []`
- [ ] Summary dừng ở 240 dòng và `truncated: true`
- [ ] Head > trần ký tự → `truncated: true`, không throw

### 11.2 Tích hợp

- [ ] Mock list/get. Không gọi gateway production trong unit test
- [ ] Member 403 cả hai route
- [ ] Rate limit 429

### 11.3 Đối chiếu tay (sau khi có ít nhất một execution đã đóng dấu)

1. Chạy một workflow có embed (bge) và một node text (GLM).
2. Admin mở `/dashboard/ai-gateway-logs?executionKey=…`.
3. Số dòng Hub = số dòng trên dashboard Cloudflare khi lọc Metadata value = executionKey đó (hoặc Event ID).
4. Chọn dòng embed: Request có `text`, Response có `shape` / `data`, cost và duration khớp dòng CF.
5. Dòng cache (nếu có) chấm xanh dương, usage `— in · — out`.
6. Member không thấy sidebar và không gọi được API.

---

## 12. Copy i18n (cốt lõi)

Namespace `AiGatewayLogsAdmin`: `page_title`, `page_description`, `execution_placeholder`, `col_time`, `col_status`, `col_model`, `col_usage`, `col_cost`, `col_duration`, `col_user_agent`, `usage_in_out`, `usage_empty`, `status_success`, `status_cached`, `status_error`, `filter_json`, `request`, `response_http`, `endpoint`, `type`, `live`, `showing`, `no_logs`, `unstamped`, `unavailable`, `truncated_payload`, `show_full_array`, `retry_step`, `open_usages`, `summary_truncated`.

VI title: “Log AI Gateway”. EN: “AI Gateway logs”.

`unstamped` VI: “Lần chạy này diễn ra trước khi Hub gắn execution vào AI Gateway, nên không đối chiếu được từng dòng log.”

---

## 13. Rủi ro

| Rủi ro | Xử lý |
|--------|--------|
| Quên một call site → log mồ côi, admin thấy thiếu | Checklist mục 0.1 là điều kiện xong phase 1. Helper không stamp trên đường node thì fail closed |
| `cf.user_id` làm rơi metadata key cuối | Chỉ 4 key; `executionKey` đứng đầu; join chính là `eventId` |
| Retry nhân log so với `service_usages` | Copy mục 8 trên header; không cảnh báo “lệch” như lỗi |
| Payload embed làm nặng detail | Collapse mảng ở client; trần ký tự server |
| Prompt khách trên màn admin | Admin + step-up; không export hàng loạt; redact secret |
| Legacy log của `unitoken` bị CF xóa | `log_gone`, không bản sao Hub |
| List `filters` không AND như giả định | Test tích hợp một execution có 2 model: filter `model` phải thu hẹp, không được trả log execution khác |
| Binding `aiGatewayLogId` bị dùng lại sau này | Spec cấm làm SSOT; review PR nếu thấy ghi log id vào DO |

---

## 14. Definition of done (phase 1)

1. Mọi call site mục 0.1 gửi `eventId = executionKey` và 4 metadata key.
2. Admin mở một execution đã chạy sau epoch, thấy bảng đúng các log đó, cột như dashboard Cloudflare.
3. Chọn một dòng embed hoặc chat: Request và Response hiện trong inspector; secret dạng key đã redact; vector dài collapse được.
4. Execution trước epoch không bị gán nhầm log cùng giờ.
5. Member không vào được. Body không ghi D1/R2/KV. Token không lộ.
6. Test mục 11.1 pass.

Spec này **không** tự implement. Khi code: đóng dấu trước, proxy sau, và không biến Hub thành kho log gateway.
