# Spec: One Platform, One Credit, Unlimited Models

> **Trạng thái:** Draft v0.2 — chuẩn bị chỉnh sửa repo  
> **Phiên bản:** 0.2  
> **Ngày:** 2026-09-16  
> **Phạm vi:** Billing, wallet, service pricing, workflow charge, marketing packages, admin economics  
> **Không thay thế:** luồng workflow → [`workflow-how-it-works.md`](./workflow-how-it-works.md); plugin → [`workflow-node-plugin-spec.md`](./workflow-node-plugin-spec.md)

**v0.2 chỉnh theo hai đánh giá:** thông lệ quốc tế + shock Cloudflare; chiến lược giá và biên lãi. Nguyên tắc One Credit giữ nguyên. Đổi chính: Credit là đơn vị dịch vụ neo USD nội bộ; GM theo **dải lớp model** (không phẳng 55%); một định nghĩa contribution (không trừ trùng support/risk); Credit hết hạn + trần tồn; van hệ số có SLA; Enterprise được thấy model family.

---

## 0. Nguyên tắc (không đàm phán)

**Thu tiền theo giá trị người dùng tiêu thụ, không thu theo chi phí hạ tầng mà chúng ta phải trả.**

Slogan vận hành:

> **One Platform, One Credit, Unlimited Models** — khách hàng trả tiền theo giá trị họ sử dụng; hệ thống tự quản lý chi phí và biên lợi nhuận ở phía sau.

Hệ quả bắt buộc:

1. AI Agents Hub **không** bán token/model của Cloudflare, AI Gateway, GPT, Claude, Llama. Không cạnh tranh OpenRouter trên USD/1M.
2. Hub bán **năng lực hoàn thành công việc bằng AI** (agent run, workflow run, job done).
3. Model rẻ hay đắt là vấn đề nội bộ trên **hệ số**. Khách SMB/Pro chỉ thấy: việc này tốn bao nhiêu Credit. Enterprise/compliance được thấy **model family** (Llama / GPT-4o / Claude …) — không thấy USD/1M, không thấy feePercent.
4. D1 / R2 / Workers / Queue / Vectorize / log / retry / support **không bán riêng**. Hấp thụ vào Subscription + hệ số Credit. Mỗi gói có quota chống abuse.
5. Khi Cloudflare/provider tăng giá: **đổi hệ số**, không đổi giá gói, không đổi `creditPriceUsd`, không biến Credit thành pass-through token.
6. Lãi bền nằm ở **Subscription + Enterprise**. Credit là van bảo vệ COGS, không phải động cơ nuôi công ty bằng Llama.

Ba lớp thu tiền — và **chỉ** ba lớp này:

| Lớp | Khách hàng mua gì | Không phải |
|-----|-------------------|------------|
| **Subscription** | Quyền dùng nền tảng (workspace, builder, API, sharing, support mức gói) | Token, model, hay chi phí Cloudflare |
| **Credit** | Mức tiêu thụ AI/Agent — đơn vị dịch vụ trả trước (deferred revenue), không phải e-money | Hóa đơn AI Gateway, USD/1M tokens |
| **Enterprise** | Sự đảm bảo (SLA, dedicated, custom quota, SSO, audit) + tùy chọn BYOK | Giá token sỉ / gói “rẻ hơn Pro” |

Khi khách lớn lên, không tăng giá gói một cách khó chịu. Họ trả nhiều hơn vì tiêu thụ nhiều hơn:

```
100 users    → ít credits
10,000 users → nhiều credits
Enterprise   → credits + dedicated infrastructure + SLA fee
```

---

## 1. Hiện trạng repo (gap)

Hệ thống **đang bán gần với chi phí model**, không bán năng lực hoàn thành việc.

### 1.1 Đơn vị khách hàng thấy

| Hiện tại | Mục tiêu |
|----------|----------|
| Ví `walletBalance` = **USD** | Ví = **Credit** (đơn vị dịch vụ) |
| Charge = `tokens × USD/1M × feePercent` | Charge = `usage × hệ số model (theo lớp GM) → Credit` |
| UI hiện `priceInput` / `priceOutput` / `feePercent` | UI hiện `X credits/run` (+ model family với Enterprise) |
| Packages marketing = API calls / tháng | Packages = Subscription + included credits (nhỏ, có trần COGS) + quota |
| Membership tier theo top-up VND/tháng | Giữ loyalty; **không** thay subscription |

### 1.2 Luồng charge hiện tại

```
Agent/RAG node
  → computeUsageChargeUsd(service, aiResponse)
       tokens × (priceInput|priceOutput) × (feePercent/100)
  → chargeServiceUsage
       debit walletBalance (USD)
       + royalty % nếu chạy workflow người khác
  → service_usages.cost = usageUsd
  → onCost(chargedUsd) → execution.totalCostVnd (tên cột lệch, giá trị USD)
```

File cốt lõi:

| File | Vai trò hiện tại |
|------|------------------|
| `workers/auth-worker/src/features/admin/service/pricing.ts` | USD/1M tokens, `feePercent`, FX VND↔USD |
| `workers/auth-worker/src/features/member/workflows/billing/billing.ts` | `billAgentUsage`, `ensureWalletBalance` |
| `workers/auth-worker/src/features/member/workflows/billing/charge.ts` | Debit ví USD + royalty |
| `workers/auth-worker/src/features/member/workflows/billing/royalty.ts` | Royalty = % của `baseCostUsd` |
| `workers/auth-worker/src/features/admin/service/domain.ts` | Schema `priceInput/Output/Cache`, `feePercent` |
| `workers/web/.../service-pricing-label.tsx` | Hiện giá token + profit % cho user |
| `workers/web/.../control/billing/` | Top-up ví USD (VNPay/Casso/PayPal) |
| `workers/web/.../packages.tsx` + `packages-preview.tsx` | Bán “API calls”, không phải Credit |
| `workers/auth-worker/.../assistant/tools/get-services-tool.ts` | Assistant trả `priceInput` / `feePercent` |

### 1.3 Những gì **giữ**

- Top-up qua VNPay / Casso / PayPal; freeze số phải trả lúc tạo lệnh.
- Royalty khi A chạy workflow của B (A trả thêm; B nhận earnings; Hub không mất COGS vì royalty).
- Membership tier (member / silver / gold / diamond) — loyalty, không phải gói sản phẩm.
- Giá USD/1M trên `services` **ở backend** = COGS catalog, input của hệ số.
- Ghi `service_usages` mỗi lần gọi (thêm Credit + COGS + contribution).
- Pipeline D1 → R2 cho analytics.

### 1.4 Những gì **cấm** sau khi migrate

Member UI / public docs / assistant **không** được thấy:

- USD per 1M tokens
- `feePercent` / “profit percent”
- Cơ chế AI Gateway billing
- Line-item D1, R2, Workers, Queue, Vectorize, log, retry

**Được thấy:**

| Ai | Thấy gì |
|----|---------|
| Free / Pro | Credit, ước lượng/run, số trừ ví, gói, quota |
| Enterprise / compliance | như Pro **+ model family** (không USD/1M) |
| Admin | full: hệ số, lớp GM, COGS, contribution, alert |

---

## 2. Mô hình sản phẩm

### 2.1 Subscription = quyền dùng nền tảng — đây là nơi lãi bền

Subscription **không** tính theo token. Nó mở khóa workspace, builder, sharing, webhook, cron, support, quota hạ tầng.

Giá subscription **ổn định theo gói**, không nhảy vì catalog Cloudflare. Nó phải **mang opex**: Llama-class không nuôi công ty (lãi tuyệt đối quá nhỏ dù GM % cao).

| Gói | Ý nghĩa | Credit | Quota | Đảm bảo |
|-----|---------|--------|-------|---------|
| **Free** | Trial | Tặng ít, hết kỳ là hết, **không** mua thêm (hoặc mua rất hạn chế) | Thấp | Best effort |
| **Pro** | Đội ngũ dùng thật | Tặng **nhỏ** + được mua thêm (có trần ví) | Trung bình | Standard, notice 7 ngày khi hệ số tăng ≥10% |
| **Enterprise** | Tiền cho sự đảm bảo | Committed volume + on-demand; hợp đồng có điều khoản reprice COGS | Dedicated / custom | SLA + notice 30 ngày (trừ emergency lỗ) |

Credit tặng trong gói:

- Không stack vô hạn: hết chu kỳ là hết.
- Có **trần COGS USD** (`includedCogsUsdCap`) song song với số Credit. Nếu agent đốt model frontier, hết trần COGS thì lần sau trừ Credit đã mua — dù vẫn còn Credit tặng trên giấy.
- Lý do: bài học Cursor 2025 — included pool sized cho completion, bị agentic/frontier đốt sạch và lỗ.

> Copy `$49` / `100,000 API calls` hiện tại là placeholder. Engine chỉ cần `planId`. Số tiền gói chốt Phase 0; **không** hard-code. Free không được thiết kế như sản phẩm chính.

### 2.2 Credit = mức tiêu thụ AI/Agent

**Một đơn vị Credit** cho mọi khách, mọi model, mọi node.

```
Model rẻ / tiny     → ít credit / đơn vị usage   (GM % cao hơn, $ tuyệt đối nhỏ)
Model mid           → Credit trung bình          (GM mục tiêu ~50%)
Model frontier      → nhiều credit / đơn vị      (GM % thấp hơn để khỏi bị so API)
Model mới           → thêm dòng hệ số; không đụng giá gói hay creditPriceUsd
```

Người dùng thấy: **Agent này tốn X credits/run** (ước lượng trước, trừ thật sau).

Credit là **đơn vị dịch vụ trả trước** (IFRS 15 deferred revenue), không phải tiền điện tử / e-wallet. Không quy đổi ngược ra tiền mặt, trừ payout royalty/earnings (sổ riêng).

### 2.3 Enterprise = đảm bảo, không phải token sỉ

Khách trả thêm cho SLA, dedicated infra, custom quota, invoice/SSO/audit, committed volume.

Hợp đồng Enterprise **phải** có điều khoản: khi provider tăng giá làm contribution dưới sàn lớp model, Hub được reprice hệ số sau notice 30 ngày (hoặc ngay nếu contribution < 0%).

**BYOK** chỉ là add-on Enterprise: khách trả provider trực tiếp; Hub thu platform fee (subscription), không pass-through hóa đơn token. Usage model do Hub host vẫn trừ Credit. BYOK không mở cho Free/Pro — tránh biến Hub thành gateway.

---

## 3. Đơn vị Credit và quy đổi

### 3.1 Định nghĩa — neo USD nội bộ, VND lúc checkout

| Khái niệm | Quy ước |
|-----------|---------|
| Đơn vị khách hàng | **Credit** (`CR`) |
| Lưu trữ | 4 chữ số thập phân |
| Hiển thị | 2 chữ số; run nhỏ có thể 4 |
| **SSOT nội bộ** | `creditPriceUsd` — mặc định `0.0077` (≈ 200 VND tại FX 26_000). **Không** đổi vì Cloudflare tăng giá |
| Checkout VN | `vndPerCredit = round(creditPriceUsd * usdVndRate)` **đóng băng trên order** |
| Checkout USD/PayPal | `credits = usd / creditPriceUsd` |

Nạp VNPay/Casso:

```
credits_credited = round( payable_vnd / (creditPriceUsd * usdVndRate_frozen) , 4 )
```

Ví dụ tại FX 26_000: nạp 200,000 VND → ~1,000 Credit. “1 Credit ≈ 200 VND” là **số marketing tại FX hiện tại**, không phải neo pháp lý vĩnh viễn.

Khi VND/USD lệch **≥ 10%** so với lần niêm yết checkout: admin được cập nhật `vndPerCredit` niêm yết (có notice). Đó là điều chỉnh **tiền tệ**, không phải điều chỉnh COGS. Van COGS vẫn là hệ số.

Không index `creditPriceUsd` theo FX hàng ngày — khách đang dùng Credit không bị “mất sức mua” vì tỷ giá trong ngày.

### 3.2 Hết hạn, FIFO, trần tồn

| Quy tắc | Chi tiết |
|---------|----------|
| Hết hạn Credit **mua** | 12 tháng kể từ ngày credited; trừ FIFO (cũ trước) |
| Credit **tặng** theo gói | Hết vào cuối chu kỳ subscription; không chuyển kỳ |
| Trần ví Pro | `maxCreditBalance` cấu hình (Phase 0). Vượt → không nạp thêm đến khi dùng bớt |
| Free | Không (hoặc rất hạn chế) mua pack lớn |
| Enterprise | Committed volume theo hợp đồng; on-demand có trần thỏa thuận |
| Breakage | Credit hết hạn = doanh thu breakage (IFRS 15); ghi sổ, không “tặng lại” im lặng |

Trần tồn chặn tích trữ Credit trước đợt Cloudflare tăng giá — đó là lỗ hổng lớn nhất của v0.1.

### 3.3 Công thức charge khách hàng (public)

Khách **không** thấy USD. Mọi AI usage billable:

```
credits = round_up(
    prompt_tokens     / 1_000_000 * coeff.input
  + cached_tokens     / 1_000_000 * coeff.inputCache
  + completion_tokens / 1_000_000 * coeff.output
  + extra_units                   * coeff.extra
  , 4)
```

Ước lượng trước khi chạy: P50 của 20 run cùng workflow+node → fallback `maxTokens` → fallback 1k in + 500 out. UI ghi rõ ước lượng ≠ số trừ ví.

Royalty (A chạy workflow của B):

```
royalty_credits = credits_usage * royaltyPercent / 100
charged_credits = credits_usage + royalty_credits
```

A trả thêm; B được cộng earnings; Hub **không** lấy royalty từ COGS của mình. Phí cổng thanh toán không dính royalty.

### 3.4 Hệ số model — GM theo lớp, không phẳng 55%

Hệ số **không** phải giá Cloudflare. Tính từ COGS + **contribution mục tiêu của lớp model**, rồi đóng băng đến khi van mục 3.5 chạy.

**Lớp model** (gán trên catalog, admin có thể override):

| Lớp | Heuristic (USD/1M input, hoặc family) | Contribution mục tiêu | Sàn (alert / đề xuất reprice) |
|-----|----------------------------------------|------------------------|-------------------------------|
| `tiny` | Embeddings, Workers AI rẻ, input &lt; $0.20/1M | **65%** | 50% |
| `mid` | Input $0.20–$2/1M | **52%** | 40% |
| `frontier` | Input ≥ $2/1M hoặc GPT-4 / Claude Opus / o-series | **38%** | 30% |

Blended mục tiêu trên **toàn bộ dòng Credit** ≈ **50%** contribution — khớp thông lệ usage infrastructure (Twilio-class), không phải gateway 0–10%, không phải SaaS thuần 75–85%.

Frontier thấp hơn để power user khỏi bị 2.6× so với API. Tiny cao hơn vì metering/support át AI cost; % cao nhưng tiền tuyệt đối nhỏ — **subscription mới nuôi opex**.

**Một định nghĩa contribution — không trừ trùng:**

```
ai_cost_usd            = tokens × provider_usd_per_1m          // COGS thật
infra_allocated_usd    = ai_cost_usd * infra_buffer / (1 - infra_buffer)
                       // Phase 1 ước lượng. Buffer = D1/R2/Workers/retry/support biến đổi / risk vận hành.
                       // KHÔNG trừ support/risk lần nữa ở dưới.

variable_cogs_usd      = ai_cost_usd + infra_allocated_usd
payment_fee_usd        = revenue_usd * payment_fee_pct         // ~2% cổng; 0 nếu chưa thu tiền (included)
revenue_usd            = credits_charged * creditPriceUsd      // royalty pass-through không tính là revenue Hub

contribution_usd       = revenue_usd - variable_cogs_usd - payment_fee_usd
contribution_pct       = contribution_usd / revenue_usd
```

`infra_buffer` mặc định **12%** (chỉ hạ tầng + retry + support biến đổi). Không nhét “lãi” vào buffer.

Hệ số:

```
loaded_cost_usd        = ai_cost_usd / (1 - infra_buffer)
target_revenue_usd     = loaded_cost_usd / (1 - target_contribution_pct[class])
coeff_per_1m           = target_revenue_usd_per_1m / creditPriceUsd
```

Ví dụ tiny (Llama input $0.067/1M, target 65%, buffer 12%):

```
creditPriceUsd         = 0.0077
loaded                 = 0.067 / 0.88 ≈ 0.0761
revenue                = 0.0761 / 0.35 ≈ 0.217
coeff.input            ≈ 0.217 / 0.0077 ≈ 28.2 Credit / 1M input
```

Ví dụ frontier (input $2.50/1M, target 38%, buffer 12%):

```
loaded                 = 2.50 / 0.88 ≈ 2.841
revenue                = 2.841 / 0.62 ≈ 4.582
coeff.input            ≈ 4.582 / 0.0077 ≈ 595 Credit / 1M input
markup vs API          ≈ 4.582 / 2.50 ≈ 1.83×     // không còn 2.6× phẳng
```

`feePercent` hiện tại: seed hệ số lúc migrate (`legacy_coeff = usd_per_1m * feePercent/100 / creditPriceUsd`), rồi **không** còn trên form member. Override biên = đổi lớp hoặc coeff tay (audit).

### 3.5 Van hệ số có kiểm soát + SLA nội bộ

Giá Credit (`creditPriceUsd`) **không** phải van hàng ngày. Van là hệ số.

| Điều kiện | Hành vi |
|-----------|---------|
| `|Δcoeff| < 10%` và contribution ≥ sàn lớp | Admin lưu; audit; không bắt buộc notify |
| `|Δcoeff| ≥ 10%` và contribution vẫn ≥ 0 | Notice in-app; **Pro +7 ngày**, **Enterprise +30 ngày**; rồi `effectiveAt` |
| Rolling 24h `contribution_pct` &lt; sàn lớp | Hệ thống **đề xuất** coeff mới để về target lớp; admin confirm. Nếu im 24h thêm và vẫn dưới sàn → escalate |
| Rolling 24h `contribution_pct` &lt; **0%** | `emergency=true`, hiệu lực ngay, notice sau, post-mortem 48h |
| Model mới | Hệ số mới; không có “thay đổi” với user cũ |
| Cloudflare tăng giá | **Cấm** đổi `creditPriceUsd` / giá gói trên đường này |

Catalog versioned:

```
model_credit_rates
  model_id, model_class
  version
  input / output / inputCache / extra
  target_contribution_pct, infra_buffer_pct
  effective_from / effective_to
  change_reason, notify_required, emergency
```

Run dùng `effective_from ≤ now < effective_to`. Không backfill run cũ.

### 3.6 Những gì không ra Credit

Không trừ: đọc UI, lưu workflow, list execution, retry do lỗi nền tảng (lỗi ta), xem log/analytics, support ticket.

Trừ: mỗi lần gọi model (LLM, embed, vision, speech); tool/node phát sinh AI usage; royalty khi chạy workflow share.

Hạ tầng (D1, Vectorize, R2, Queue) **không** thành line-item. Chúng: (1) nằm trong `infra_buffer`, (2) bị quota gói chặn.

---

## 4. Economics nội bộ

### 4.1 Công thức — một lần, không trùng

**Dòng Credit (theo từng usage / model / workflow):**

```
Credit contribution =
    Revenue từ Credit                    // credits_charged × creditPriceUsd; không gồm royalty pass-through
  − AI cost
  − Infrastructure allocated
  − Payment fee
```

Support ticket định phí và “risk reserve” **đã nằm trong `infra_buffer`**. Không trừ thêm trên dòng này.

**P&L công ty (tháng):**

```
Company contribution ≈
    Credit contribution (blended ~50% mục tiêu)
  + Subscription revenue                 // GM cao; phải mang opex
  + Enterprise SLA / dedicated / BYOK fee
  − Opex còn lại (R&D, sales, G&A không nằm trong buffer)
```

Kỳ vọng: chỉ bán Credit → net dễ mỏng hoặc âm lúc build. Có Pro/Enterprise thật → blended GM có thể lên dải SaaS. Included credit nuốt hết giá gói → kịch bản lỗ (cấm bằng trần COGS).

### 4.2 Sổ kép trên mỗi usage

| Sổ | Trường | Ai thấy |
|----|--------|---------|
| Khách | `creditsCharged`, `creditsUsage`, `creditsRoyalty` | User, billing, execution |
| Nội bộ | `cogsAiUsd`, `cogsInfraUsdEst`, `paymentFeeUsd`, `revenueUsd`, `contributionUsd`, `contributionPct`, `modelId`, `modelClass`, `creditRateVersion` | Admin / finance |

Alert:

- 24h contribution lớp &lt; sàn → đề xuất hệ số (3.5)
- 24h contribution &lt; 0% → emergency
- Workflow lỗ (model đắt + royalty không liên quan COGS; lỗ = contribution âm)
- Volume vs quota → abuse
- Tồn Credit (ví) / user > ngưỡng → rủi ro prepaid shock

Dashboard admin: contribution theo model lớp 7/30 ngày; theo workflow; Credit sold vs hóa đơn Cloudflare; infra estimate vs subscription; top workflow lỗ; tồn Credit sắp hết hạn; included COGS vs cap.

### 4.3 Infra estimate

Không đo từng request D1/R2 để bán. Đo để bảo vệ biên.

Phase 1: `cogsInfraUsdEst = ai_cost_usd * infra_buffer / (1 - infra_buffer)` — ghi rõ ước lượng.  
Phase 2+: allocate từ Cloudflare billing export / GraphQL theo share usage.

### 4.4 Playbook shock Cloudflare / provider

1. Cảnh báo 24h contribution dưới sàn → đề xuất hệ số, không đụng giá gói.
2. Emergency nếu lỗ — hiệu lực ngay.
3. Prepaid đã bán: giao tiếp với hệ số **tại thời điểm charge** (không grandfather vô hạn). Expiry 12 tháng + trần ví giới hạn lỗ tồn kho. Enterprise committed: reprice theo hợp đồng.
4. **Cấm** phản ứng bằng pass-through token hay tăng `creditPriceUsd` trong đêm.
5. Mix shift sang frontier tự hóa đơn nhiều Credit hơn (hệ số theo model) — không phải bug.

Sức chịu toán: với buffer 12% + contribution 52% (mid), đóng băng hệ số vẫn hòa vốn khoảng khi AI cost tăng ~2.1×. Đó là buffer ngắn hạn, không phải bảo hiểm bỏ van.

---

## 5. Quota hạ tầng (chống abuse, không phải SKU)

Vượt trần → chặn hoặc upgrade — **không** hóa đơn D1/R2.

| Quota | Free | Pro | Enterprise |
|-------|------|-----|------------|
| Credits tặng / kỳ | thấp, hết kỳ là hết | nhỏ + trần COGS USD | custom + trần COGS |
| Mua thêm Credit | khóa hoặc rất hạn chế | có, trần ví | committed + on-demand |
| Workflow runs / ngày | trần | trần cao | custom |
| Vectorize / R2 / concurrent / retention / seats | thấp | trung bình | dedicated / SSO |

Membership tier chỉ nới quota hoặc tặng credit **trong trần COGS**, không tạo đơn vị tính tiền thứ tư.

---

## 6. Trải nghiệm khách hàng

### 6.1 Câu khách phải trả lời được

1. Còn bao nhiêu Credit? (và Credit nào sắp hết hạn)
2. Agent/workflow tốn khoảng bao nhiêu Credit / run?
3. Lần chạy vừa rồi trừ bao nhiêu? (usage + royalty)
4. Gói cho phép gì? — không phải “model nào giá USD bao nhiêu”
5. (Enterprise) Agent đang chạy family nào? Llama / GPT / Claude — vẫn trừ Credit

Published burn-rate: trang billing/docs liệt kê **ước lượng Credit/run theo template agent**, không bảng USD/1M.

### 6.2 Surface UI

| Surface | Hiện tại | Đổi thành |
|---------|----------|-----------|
| Wallet | `$12.34` | `1,604 Credits` (+ VND tương đương lúc nạp, optional) |
| Billing | USD volume | Credit còn / đã dùng / sắp hết hạn / đã nạp |
| Top-up | Nạp USD | Nạp VND/USD → nhận Credit; hiện quy đổi **đóng băng trên lệnh** |
| Service list | `model · $in/$out · profit %` | Năng lực + `~X CR / run` |
| Agent config | endpoint + giá model | Ước lượng Credit; Enterprise thấy model family |
| Execution | `formatUsd` | `12.40 CR` |
| Earnings | USD | Credit accrued → payout VND/USD |
| Packages | API calls | Subscription + included (nhỏ) + quota |
| Assistant `get-services` | token price | `estimatedCreditsPerRun`; Enterprise thêm `modelFamily` |

### 6.3 Admin

Catalog hệ số + lớp model; version; notify; emergency.  
`creditPriceUsd` (confirm kép, cực hiếm).  
Dải contribution / buffer / sàn theo lớp.  
Dashboard mục 4.2. Override 1 service = audit.

Member không nhập USD/1M. Chọn năng lực đã duyệt; hệ số thuộc Hub.

---

## 7. Hợp đồng dữ liệu

### 7.1 `BillingConfig`

```ts
billing: {
  MIN_TOP_UP_VND?: number
  WORKFLOW_ROYALTY_PERCENT?: number
  SERVICE_FEE_MARKUP_PERCENT?: number  // deprecated; chỉ seed migrate

  CREDIT_PRICE_USD: number             // default 0.0077; SSOT
  PAYMENT_FEE_PCT: number              // default 2
  INFRA_BUFFER_PCT: number             // default 12 — chỉ variable infra/support/retry
  COEFF_NOTIFY_CHANGE_PCT: number      // default 10
  COEFF_NOTIFY_LEAD_DAYS_PRO: number   // default 7
  COEFF_NOTIFY_LEAD_DAYS_ENT: number   // default 30
  CREDIT_EXPIRY_DAYS: number           // default 365
  MAX_CREDIT_BALANCE_PRO?: number
  FX_RELIST_THRESHOLD_PCT: number      // default 10 — niêm yết VND/Credit

  TARGET_CONTRIBUTION_PCT: {
    tiny: 65
    mid: 52
    frontier: 38
  }
  FLOOR_CONTRIBUTION_PCT: {
    tiny: 50
    mid: 40
    frontier: 30
  }
}
```

Không còn `TARGET_GROSS_MARGIN_PCT: 55` phẳng.

### 7.2 User ledger

`walletBalance` đổi ngữ nghĩa → Credit. API public: `creditBalance`. `walletCurrency = 'CR'`.

Lots FIFO (bảng hoặc JSON trong DO): `{ credits, expiresAt, source: purchased|included, remaining }`.

Backfill:

```
credits = round( walletBalanceUsd / CREDIT_PRICE_USD , 4 )
expiresAt = cutover + 365 days
```

Ghi `billing_cutover_events { userId, usdBefore, creditsAfter, creditPriceUsd }`.

### 7.3 Catalog

Giữ `priceInput/Output/Cache` = COGS USD/1M (admin, scan CF). Thêm:

```
modelClass
creditCoeffInput / Output / InputCache
creditRateVersion
targetContributionPct
```

SSOT lâu dài: `model_credit_rates`. Phase 1 denormalize lên `services`. Scan CF → classify lớp → compute coeff. Không đẩy USD ra member.

### 7.4 Usage & execution

```
creditsUsage, creditsRoyalty, creditsCharged
cogsAiUsd, cogsInfraUsdEst, paymentFeeUsd
revenueUsd, contributionUsd, contributionPct
modelId, modelClass, creditRateVersion
```

`cost` deprecated: Phase 1 dual-write `cost = revenueUsd`. Execution: thêm `totalCreditsCharged` / `totalCreditsRoyalty`; UI đọc Credit.

### 7.5 Orders

Freeze `payableAmountVnd` **và** `usdVndRate` / `creditPriceUsd` trên lệnh. `creditedCredits` ghi ví. API trả Credit.

### 7.6 Royalty / earnings

```
payout_usd = royalty_credits * creditPriceUsd
payout_vnd = convertUsdToVnd(payout_usd, rate_at_payout)
```

Một chiều: Credit → USD (`creditPriceUsd`) → VND lúc payout. Không nhân `creditPriceVnd` cứng (tránh lệch FX).

---

## 8. Hợp đồng API / engine

### 8.1 Charge path

```ts
computeUsageCredits(service, response) → { creditsUsage, cogsAiUsd, modelClass, rateVersion }
chargeServiceUsage({ creditsUsage, cogsAiUsd, ... }) → UsageCharge
  UsageCharge = {
    creditsUsage, creditsRoyalty, creditsCharged,
    cogsAiUsd, revenueUsd, contributionPct,  // nội bộ
  }
onCost(creditsCharged, creditsRoyalty?)
```

`ensureWalletBalance`: có lot còn hạn, `creditBalance > 0`. Phase 2: reserve ước lượng, settle, release. Phase 1: check > 0 như hiện tại.

Trừ FIFO lot; included lot tôn trọng `includedCogsUsdCap` của kỳ.

### 8.2 Member DTO

Cấm: `priceInput`, `priceOutput`, `priceInputCache`, `feePercent`, `cogsAiUsd`, `contributionPct`.

Được: `creditBalance`, `creditsExpiring`, `estimatedCreditsPerRun`, `creditsCharged`, `plan`, `quotaRemaining`. Enterprise: `modelFamily`.

### 8.3 Marketing

`packages.tsx` / `packages-preview.tsx`: Subscription + included nhỏ + quota. Bỏ “unlimited API calls”.

---

## 9. Ranh giới (non-goals)

Không nằm trong spec:

- Đổi graph format / node plugin
- Referral commission (giữ top-up VND đến PR riêng)
- Credit đa tiền tệ về phía khách (một Credit toàn cầu)
- Bán token từng provider như SKU
- Metering per-request D1/R2 để invoice
- Tự đổi `creditPriceUsd` theo FX hay theo Cloudflare hàng ngày
- BYOK cho Free/Pro
- Grandfather hệ số cũ vô hạn cho Credit đã nạp

FX: nạp VND dùng rate đóng băng trên order; COGS so USD; payout dùng rate ngày chi. Khách VN thấy VND lúc checkout; lúc dùng thấy Credit.

---

## 10. Migration

```
Phase 0  Chốt creditPriceUsd, dải GM, buffer, quota, included COGS cap, giá gói, trần ví
Phase 1  Dual-write Credit + USD; UI Credit; ẩn token price; FIFO lots + expiry
Phase 2  Catalog lớp+hệ số versioned; auto-propose; notice theo gói; quota; dashboard
Phase 3  Ngừng đọc cost USD như giá khách; xóa member fields giá token
```

Dual-write Phase 1: trừ Credit; `service_usages.cost = revenueUsd`; ghi contribution. UI member chỉ Credit.

Seed hệ số từ `feePercent` cũ rồi gán lớp theo heuristic giá USD/1M.

Run lịch sử: nhãn legacy USD. Không bắt buộc convert.

Feature flag `BILLING_UNIT=usd|credit`. Default `usd` đến khi backfill + UI xong staging.

---

## 11. Kế hoạch chỉnh repo

### PR 1 — Domain Credit

`computeUsageCredits`, `usdToCredits`, lots/expiry helpers, `BillingConfig` v0.2, tests.

### PR 2 — Engine charge Credit

`charge.ts` / `billing.ts` / `royalty.ts` / `onCost`; FIFO lots; dual-write; flag.

### PR 3 — Member UI Credit

Wallet, billing (hết hạn), execution, top-up “nhận X Credit”, ẩn token price, assistant tool.

### PR 4 — Catalog lớp + hệ số

Admin CRUD; scan CF → class → coeff; member form không nhập USD/1M.

### PR 5 — Subscription + quota + included COGS cap

Packages copy; entitlements; cap included; trần ví Pro.

### PR 6 — Contribution observability + van tự đề xuất

Ghi sổ kép; dashboard; alert sàn; emergency; notice Pro 7 / Ent 30.

---

## 12. File map

Giữ map v0.1. Thêm khi implement: schema lots/expiry (`users` hoặc bảng `credit_lots`), `model_class` trên services, config dải GM. Tests thêm: `credit-conversion.test.ts` (lớp GM, FIFO expiry, FX checkout freeze, emergency &lt; 0%, included COGS cap, không trừ trùng buffer).

---

## 13. Tiêu chí chấp nhận

**Khách**

- [ ] Member không thấy USD/1M, feePercent, AI Gateway.
- [ ] Ví = Credit; nạp hiện số Credit; lot sắp hết hạn hiện được.
- [ ] Ước lượng credits/run ≠ số trừ sau run, và UI nói rõ.
- [ ] Đổi model chỉ đổi Credit/run; không đổi `creditPriceUsd` hay giá gói.
- [ ] Enterprise thấy model family; Free/Pro không bắt buộc.
- [ ] Scale usage → trả nhiều Credit hơn.

**Hệ thống**

- [ ] Mọi AI call qua `computeUsageCredits` + `chargeServiceUsage`.
- [ ] Mỗi usage có `creditsCharged`, `cogsAiUsd`, `contributionPct`, `modelClass`.
- [ ] Contribution **không** trừ support/risk lần hai sau buffer.
- [ ] Hệ số theo lớp tiny/mid/frontier; versioned; van 3.5.
- [ ] Credit mua hết hạn 12 tháng FIFO; included hết kỳ; Pro có trần ví.
- [ ] Included có trần COGS USD.
- [ ] Infra không có SKU trên hóa đơn khách.
- [ ] Flag rollback USD đến hết Phase 3.

**Kinh doanh**

- [ ] Thêm model = 1 dòng hệ số + lớp.
- [ ] Cloudflare tăng giá → hệ số, không pass-through, không tăng gói trong đêm.
- [ ] Enterprise = SLA/dedicated/BYOK fee, không bán token sỉ.
- [ ] Blended contribution Credit mục tiêu ~50%; frontier markup &lt; tiny markup.

---

## 14. Đã chốt vs để mở

### Đã chốt (v0.2)

1. Một Credit; không bán token Cloudflare.
2. Ba lớp thu tiền; lãi bền ở Subscription/Enterprise.
3. `creditPriceUsd` SSOT; VND chỉ checkout, freeze trên order.
4. GM/contribution **theo lớp** (65 / 52 / 38), blended ~50%; không phẳng 55%.
5. Một công thức contribution; buffer không double-count.
6. Hết hạn 12 tháng + trần tồn + included COGS cap.
7. Van hệ số: đề xuất khi dưới sàn; emergency khi lỗ; notice Pro 7 / Ent 30.
8. Enterprise thấy model family; BYOK chỉ Enterprise.
9. Dual-write rồi cắt.

### Mở — Phase 0 trước PR 1

| # | Câu hỏi | Gợi ý |
|---|---------|--------|
| A | `CREDIT_PRICE_USD` chính thức? | 0.0077 (≈ 200 VND @ 26k) |
| B | Included credits + `includedCogsUsdCap` Free/Pro? | Tặng nhỏ; cap COGS &lt;&lt; giá gói |
| C | Giá subscription Pro / Enterprise? | Phải mang opex; engine cần plan id |
| D | `MAX_CREDIT_BALANCE_PRO`? | Cỡ 6–12 tháng usage điển hình |
| E | Member tự chọn model trên service? | Có; không tự set giá; hệ số Hub |
| F | Quota số (R2 GB, runs/ngày)? | Khung mục 5 |
| G | Referral? | Giữ top-up VND đến PR riêng |
| H | Heuristic gán `tiny/mid/frontier` có cần bảng tay không? | Heuristic + override admin |
| I | Pre-auth reserve từ Phase 1? | Không; Phase 2 |

---

## 15. Câu nhắc khi review PR

> Đang bán token Cloudflare không? Lộ USD/1M trên member → sai hướng.  
> Một đơn vị Credit? Neo `creditPriceUsd`, chưa đổi vì CF tăng giá?  
> Hệ số có đúng lớp model, không phẳng 55%?  
> Contribution có trừ trùng support/risk không?  
> Credit mua có FIFO + hết hạn? Included có trần COGS?  
> SKU hạ tầng có lọt hóa đơn không?  
> Cloudflare shock: đã đụng hệ số, chưa đụng giá gói / pass-through?

---

## 16. Tóm tắt một dòng

Khách trả **Credit cho việc hoàn thành**; giá gói bán quyền dùng; Enterprise bán đảm bảo.  
Hệ thống đổi model → Credit theo **dải biên** (không 55% phẳng), neo Credit bằng USD, tự giữ contribution ở phía sau — và không bao giờ hóa đơn D1/R2/Workers hay token Cloudflare như một sản phẩm.
