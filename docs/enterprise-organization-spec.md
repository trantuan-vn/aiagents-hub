# Spec: Enterprise — tổ chức và workflow riêng

> **Trạng thái:** Draft v0.4 — dòng DO → D1 → R2 khớp pipeline đang chạy  
> **Phiên bản:** 0.4  
> **Ngày:** 2026-10-04  
> **Phạm vi:** Tổ chức Enterprise do admin tạo, ghế Business + Pro có gia hạn, workflow phải được tổ chức chấp nhận, phân quyền trigger bền, credential riêng từng user, trang tĩnh  

> **v0.4:** cờ và plan chỉ ghi trên UserDO; D1 là bản chiếu qua queue; hook đọc DO; hóa đơn áp từng DO có idempotency; sổ tiền đi `orders` / `payments` / `workflow_royalties` để tới R2. Grant và credential ở D1, không vào queue và không bị archive  
> **Bổ sung, không thay thế:** giá 4 gói và PayPal → [`subscription-packages-spec.md`](./subscription-packages-spec.md); Credit → [`business-model-one-credit-spec.md`](./business-model-one-credit-spec.md); graph chạy thế nào → [`workflow-how-it-works.md`](./workflow-how-it-works.md)

Enterprise ở spec này là **tổ chức**. User Business trả một kỳ cho các ghế được đưa vào hóa đơn. Không phải `planId` thứ năm và không có giá niêm yết cố định. SLA / SSO / BYOK / hóa đơn công ty vẫn là phụ lục hợp đồng sau, không nằm trong v0.4.

---

## 0. Nguyên tắc

1. User đã được tổ chức bao (`planSource = enterprise`) không tự mua Pro hoặc Business. User **Business** trả **một khoản cho các ghế được đưa vào hóa đơn** theo kỳ 1, 3, 6 hoặc 12 tháng. Khoản đó bật đúng những ghế đó đến cùng một `periodEnd`. Ví Credit của từng người không gộp.
2. Admin tạo tổ chức và ghi `minProSeats = n`. Tổ chức `active` khi kỳ đã trả còn hạn, hoặc đang trong 7 ngày sau `periodEnd`, và không bị `adminHold`. Ngưỡng 1 Business + n Pro chỉ chặn lúc tạo hóa đơn, không tắt catalog giữa kỳ đã trả.
3. Workflow chỉ có hai loại trên cùng một hàng `agent_workflows`: **thường** và **cho enterprise**. Không có graph engine thứ hai.
4. Người tạo gửi yêu cầu bật cờ. Admin mở đúng workflow đó ở chế độ chỉ xem, rồi chấp nhận thì `isEnterprise` mới thành true. Người tạo không tự bật cờ.
5. Một workflow enterprise gắn **đúng một** tổ chức. Người tạo gửi đề nghị. User **Business** của tổ chức đó chấp nhận thì workflow mới vào catalog của tổ chức.
6. Cờ, `enterpriseId` và acceptance chỉ ghi trên UserDO của owner. Queue chiếu sang D1. List cộng đồng có thể còn thấy workflow đến khi flush xong. Hook, form, chat và execute đọc UserDO và từ chối ngay. Không ghi thẳng bảng `agent_workflows` trên D1. Tắt cờ khi tổ chức đã chấp nhận thì không tự public lại.
7. User Business của tổ chức đang dùng được thấy mọi workflow đã chấp nhận và mọi trigger của graph. User Pro chỉ thấy workflow mình có ít nhất một grant, và chỉ kích hoạt đúng các trigger đã cấp tại thời điểm cấp. Trigger thêm sau không nằm trong grant cũ.

---

## 1. Hiện trạng repo

| Việc | Sự thật trong code |
|------|-------------------|
| Gói self-serve | `planId`: `free \| starter \| pro \| business`. Entitlement [`plan.ts`](../workers/auth-worker/src/features/member/workflows/billing/plan.ts) |
| Workflow | [`AgentWorkflowSchema`](../workers/auth-worker/src/features/member/workflows/domain/domain.ts): `isShared`, `status` `draft \| published`, `minPlanId`. Không có cờ enterprise |
| Catalog cộng đồng | `GET /dashboard/.../workflows/shared` → [`listSharedWorkflowsFromD1`](../workers/auth-worker/src/features/member/workflows/infrastructure/infrastructure.ts): `isShared = 1` và `status = published` |
| Chạy workflow người khác | `GET/POST /shared/:ownerId/:workflowId` chỉ khi `isShared = 1` |
| Trang tĩnh | `/packages` có 4 card + footer “hợp đồng”. [`/docs/enterprise`](../workers/web/src/app/(external)/pages/docs/enterprise.tsx) mô tả SLA/SSO/BYOK, CTA `/contact`. Topic `enterprise` đã có trên [`contact.tsx`](../workers/web/src/app/(external)/pages/contact.tsx) |
| Tổ chức UserDO | `organizationScoped` là scope bảng DO, **không** phải sản phẩm Enterprise này. Không tái sử dụng bảng đó làm nguồn sự thật |

---

## 2. Tổ chức Enterprise

### 2.1 Bản ghi

Admin tạo bản ghi tổ chức. Không có card giá cố định. User Business thanh toán kỳ của tổ chức trong dashboard.

```ts
type EnterpriseStatus = 'pending' | 'active' | 'suspended';

type Enterprise = {
  id: string;
  name: string;
  /** n — số user Pro tối thiểu. Admin đặt lúc tạo, sửa được sau. Số nguyên ≥ 0. */
  minProSeats: number;
  status: EnterpriseStatus;
  /** ISO. Chỉ khi `periodEnd` đã qua mà chưa có kỳ mới. Hết mốc này thì suspended. */
  seatGraceUntil?: string;
  adminHold: boolean;
  note?: string;
  /** Hết kỳ đang trả. Null khi chưa từng thanh toán. */
  periodEnd?: string;
  /** Kỳ của lần trả gần nhất. */
  planInterval?: 1 | 3 | 6 | 12;
};
```

`pending` là trạng thái lúc tạo. Chưa ai dùng catalog enterprise của tổ chức này.

### 2.2 Thành viên

Admin thêm và gỡ user. Mỗi thành viên có `seatRole`: `business` hoặc `pro`. Một user thuộc **tối đa một** tổ chức. Thêm user đang ở tổ chức khác → 409.

Thành viên không tự rời và không tự mời. Không có vai trò admin phía khách. User Business trả tiền cho roster, không tự thêm ghế.

### 2.3 Hai cách đếm ghế

Hai phép đếm khác nhau, đừng dùng lẫn.

| Phép đếm | Dùng ở đâu | Định nghĩa |
|----------|------------|------------|
| `billable*` | Lúc tạo hóa đơn (mục 2.5) | Thành viên có `seatRole` đó và **không** bị loại. Không cần `planSource = enterprise` — lần trả đầu chưa ai có |
| “đang hiệu lực” | Lúc đọc catalog, grant, kích hoạt (mục 3.3, 3.5) | `seatRole` khớp `planId`, `planSource` là `enterprise` hoặc `admin`, và `now < periodEnd` hoặc `now < seatGraceUntil` |

Ghế bị loại khỏi hóa đơn: `planSource = paypal` với `planStatus = active` (đang tự trả), hoặc `planSource = admin` (được admin tặng gói). Hai nhóm này không bị trừ tiền và capture không ghi đè plan của họ.

Ngưỡng dưới đây chỉ chặn lúc tạo hóa đơn kỳ. Catalog không tắt vì roster tụt dưới ngưỡng trong kỳ đã trả.

```
billableBusiness >= 1  AND  billablePro >= minProSeats
```

`minProSeats = 0` nghĩa là hóa đơn chỉ cần 1 Business tính được tiền. Admin vẫn ghi số này lúc tạo tổ chức.

`GET /dashboard/admin/enterprises` trả cả hai: `billableBusiness` / `billablePro` và `activeBusiness` / `activePro`.

### 2.4 Chuyển trạng thái

`seatGraceUntil` chỉ được đặt khi `periodEnd` đã qua và chưa có kỳ mới. Không đặt vì thiếu ghế.

Trong 7 ngày sau `periodEnd`, `status` vẫn `active`, catalog vẫn chạy, user Business thấy banner. Hết `seatGraceUntil` mà chưa thanh toán → `suspended`, mọi user `planSource = enterprise` của tổ chức này về `free`. Cửa production của workflow tổ chức dừng.

| Từ | Khi | Sang |
|----|-----|------|
| `pending` hoặc `suspended` vì hết hạn | Thanh toán kỳ thành công, roster hóa đơn đủ ngưỡng, không `adminHold` | `active`, đặt `periodEnd`, xóa `seatGraceUntil` |
| `active`, `periodEnd` đã qua, chưa có `seatGraceUntil` | Chưa trả kỳ sau | giữ `active`, `seatGraceUntil = periodEnd + 7 ngày` |
| `active`, trong grace | Thanh toán kỳ sau thành công | giữ `active`, xóa grace, `periodEnd` mới |
| `active` hoặc grace, tới `seatGraceUntil` | Chưa trả | `suspended`, gỡ plan enterprise |
| bất kỳ, kỳ chưa hết grace | Admin bật `adminHold` | `suspended` ngay với catalog và trigger. **Không** gỡ `planId` |
| `suspended` vì `adminHold` | Gỡ hold, còn `now < periodEnd` hoặc còn grace | `active` |
| `suspended` vì `adminHold` | Gỡ hold, đã qua grace | giữ `suspended`. Plan đã gỡ lúc hết grace |

Tụt dưới `n` ghế giữa kỳ không đổi `status` và không hoàn tiền. Admin không bật `active` khi chưa có kỳ đã trả. Gỡ `adminHold` sau khi đã hết grace không tự mở catalog.

Cron mỗi giờ, kể cả tổ chức đang `adminHold`: `periodEnd <= now` mà chưa có `seatGraceUntil` thì đặt grace; quá `seatGraceUntil` thì gỡ plan enterprise và để `status = suspended`.

Xóa tổ chức: chỉ khi không còn workflow `pending` hoặc `accepted`. Kỳ đã trả không hoàn.

### 2.5 Một khoản cho cả tổ chức

User có `seatRole = business` và **không** bị loại trả một lần cho một kỳ. Kỳ là 1, 3, 6 hoặc 12 tháng, cùng chiết khấu gói cá nhân trong [`subscription-packages-spec.md`](./subscription-packages-spec.md) mục 2. Giá tháng lấy từ entitlement Pro và Business (`plan.ts` / `GET /public/plans`), không hard-code trên UI. Hiện tại list là Pro $19.90 và Business $99.90.

Ghế bị loại theo mục 2.3 không vào tiền và không vào roster khóa. Màn thanh toán liệt kê họ là “đang tự trả” hoặc “admin tặng”. Họ vào hóa đơn sau khi plan riêng đó không còn hiệu lực, bằng lần trả kỳ sau hoặc khoản thêm ghế.

```
chargeUsd =
    prepaidUsd(businessListPerMonth, interval) * billableBusiness
  + prepaidUsd(proListPerMonth, interval) * billablePro
```

`billable*` chỉ đếm ghế không bị loại. `prepaidUsd` là hàm của spec gói. Hóa đơn khóa đúng danh sách này lúc tạo (user, `seatRole`, đơn giá). Đổi thành viên sau lúc tạo không đổi số tiền của hóa đơn đó.

Không tạo được hóa đơn khi `billableBusiness < 1` hoặc `billablePro < minProSeats`. Người bấm trả phải nằm trong danh sách khóa với `seatRole = business`. Nếu mọi ghế Business đều “đang tự trả” → 403, họ hủy gói cá nhân trước.

Mỗi tổ chức chỉ một hóa đơn `pending`, kể cả hóa đơn kỳ và hóa đơn thêm ghế. Hóa đơn thứ hai → 409. Người trả hủy được hóa đơn pending. Cron mỗi giờ chuyển hóa đơn `pending` quá 24 giờ sang `expired`; checkout cũng coi hóa đơn quá hạn là đã hết và tạo hóa đơn mới.

Thanh toán xong, với từng user trong roster đã khóa:

- `planId` = `seatRole`
- `planSource = enterprise`
- `planStatus = active`
- `planCurrentPeriodEnd` = `periodEnd` của tổ chức
- Credit tặng theo entitlement của ghế đó, reset mỗi tháng UTC như gói cá nhân. Khoản tổ chức không phải gói Credit.

User `planSource = enterprise` gọi checkout gói lẻ → 403 `ENTERPRISE_PLAN_MANAGED`. Webhook PayPal của subscription cá nhân không đổi `planId`, `planSource`, `planStatus`, `planCurrentPeriodEnd` của user đó.

Kỳ mới:

```
if (periodEnd > addMonths(now, interval)) → 409 ALREADY_PREPAID
anchor = periodEnd > now ? periodEnd : now
periodEnd = addMonths(anchor, interval)
```

`addMonths` cộng đúng số tháng UTC. Trả khi kỳ cũ còn hạn thì nối tiếp, không mất ngày, và chỉ xếp thêm **một** kỳ. Trả khi kỳ cũ đã hết thì bắt đầu lúc thanh toán thành công.

Không dùng PayPal Subscriptions tự gia hạn. Mỗi kỳ là một lần trả (PayPal Orders hoặc Casso).

Thêm thành viên khi đã có `periodEnd` trong tương lai: user Business trả prorate cho đúng ghế đó đến `periodEnd` hiện tại, không kéo dài kỳ. Nếu đã trả sớm, `periodEnd` nằm sau hơn một kỳ, prorate gồm phần ngày còn lại của kỳ đang chạy **cộng** cả kỳ đã trả trước.

```ts
function prorateSeatUsd(listPerMonth: number, interval: PlanInterval, now: Date, periodEnd: Date): number {
  let total = 0;
  let cursorEnd = periodEnd;
  while (cursorEnd.getTime() > now.getTime()) {
    const cursorStart = addMonths(cursorEnd, -interval);
    const segmentMs = cursorEnd.getTime() - cursorStart.getTime();
    const usedMs = cursorEnd.getTime() - Math.max(cursorStart.getTime(), now.getTime());
    total += prepaidUsd(listPerMonth, interval) * (usedMs / segmentMs);
    cursorEnd = cursorStart;
  }
  return Math.round(total * 100) / 100;
}
```

Ví dụ kỳ 1 tháng, `periodEnd` đang là 1 tháng nữa: prorate một đoạn, nhỏ hơn một kỳ. Vừa trả sớm nên `periodEnd` còn khoảng 2 tháng: một đoạn lẻ của tháng đang chạy cộng một tháng đầy đủ đã trả trước.

Không có `periodEnd` trong tương lai → không tạo prorate, 403. Gỡ thành viên giữa kỳ không hoàn tiền. Nếu `planSource` của họ là `enterprise`, gỡ xong thì `planId` về `free` ngay. Catalog vẫn `active` đến hết kỳ.

Cửa này không mở ví Credit chung. Usage mỗi lần chạy vẫn trừ ví người chạy.

---

## 3. Hai loại workflow

Cùng bảng, cùng builder, cùng executor. Khác nhau ở hai cột và ở chỗ catalog đọc chúng.

```ts
// AgentWorkflowSchema — thêm
isEnterprise: z.boolean().default(false),
/** Tổ chức được đề nghị. Null khi chưa gửi. */
enterpriseId: z.string().max(64).optional(),
enterpriseAcceptance: z.enum(['none', 'pending', 'accepted']).default('none'),
/** % royalty đóng băng lúc chấp nhận. Null khi chưa accepted. */
acceptedRoyaltyPercent: z.number().min(0).max(100).optional(),
```

Mỗi node trigger trên definition có `data.enterpriseTriggerKey`: UUID sinh **một lần** khi node được tạo, không phải id canvas. Đổi label, kéo node, sync D1 không đổi key. Xóa node rồi tạo node mới thì key mới — grant cũ không áp vào node mới. Đó là chủ ý: cửa mới phải được cấp lại.

| | Workflow thường | Workflow cho enterprise |
|--|-----------------|-------------------------|
| Cờ | `isEnterprise = false` | `isEnterprise = true` |
| Ai tạo graph | User hoặc admin, như hiện tại | Cùng hàng đó, không tạo loại mới |
| Ai bật loại | — | **Chỉ admin** đặt `isEnterprise` |
| Vào tổ chức | — | Người tạo **đề nghị** một tổ chức. User Business của tổ chức đó **chấp nhận** |
| `isShared` + `published` | Hiện catalog công khai, ai đủ `minPlanId` cũng chạy | Không vào catalog công khai. Khối riêng trên màn cộng đồng, chỉ sau khi `accepted` |
| Số tổ chức | 0 | Đúng 1. Đề nghị tổ chức khác thì xóa grant cũ và đưa acceptance về `pending` |

Người tạo có thể là admin hoặc user thường. Cờ không suy từ “ai tạo”. Không có API liệt kê mọi tổ chức cho người tạo. Admin đưa `enterpriseId` cho người sẽ gửi đề nghị, sau khi đã chấp nhận yêu cầu bật cờ.

### 3.0 Xin admin bật cờ

Người tạo không gửi `isEnterprise`. Họ gửi một yêu cầu. Admin chỉ nhìn và bật cờ những workflow có yêu cầu đang mở. Không có màn admin duyệt mọi workflow riêng của user.

Owner `POST /dashboard/build/workflows/:id/enterprise-flag-request` với `{ note?: string }`.

- Chỉ owner. Workflow chưa `isEnterprise`.
- Một workflow chỉ một yêu cầu `pending`. Gửi lần nữa khi đang `pending` → 409.
- Yêu cầu không đổi cờ, không đổi `isShared`, không gỡ workflow khỏi catalog công khai.
- Owner xóa workflow khi yêu cầu còn `pending` thì xóa luôn yêu cầu, trong cùng request.

Admin `GET /dashboard/admin/enterprise-flag-requests` liệt kê các yêu cầu `pending`: ai tạo, tên workflow, `status` draft/published, `isShared`, thời điểm, `note`.

Admin mở một yêu cầu thì đọc definition **trên UserDO của owner** (không phải bản D1 chờ sync): tên, mô tả, tag, graph. Màn này là canvas chỉ xem, cùng graph owner đang sửa. Admin không sửa node, không chạy production, không bật share.

| Việc của admin | Hệ quả |
|----------------|--------|
| Chấp nhận | Như mục 3.1 với `isEnterprise: true`. Yêu cầu → `approved`. |
| Từ chối `{ reason }` | Cờ vẫn false. Yêu cầu → `rejected`, lưu `reason`. Owner thấy lý do trên workflow của mình |
| Owner rút yêu cầu `pending` | Yêu cầu → `cancelled`. Cờ vẫn false |

Sau khi bị từ chối hoặc rút, owner được gửi yêu cầu mới. `PUT` admin `{ isEnterprise: true }` khi không có yêu cầu `pending` của đúng workflow → 409 `ENTERPRISE_FLAG_REQUEST_REQUIRED`. Tắt cờ không đi qua hàng chờ này.

### 3.1 Bật và tắt cờ

`PUT` admin. Body `{ isEnterprise: boolean, force?: boolean }`.

Chấp nhận yêu cầu chỉ sửa hàng `agent_workflows` trên UserDO của owner, rồi để queue-worker chiếu lên D1 như mọi lần sửa workflow khác. Không `UPDATE` D1 trong request này. `ON CONFLICT` của queue thay cả dòng, nên một message flush từ trước lúc bật cờ, nếu tới sau một ghi D1 tay, sẽ đặt `isEnterprise` về 0.

- `true`: chỉ khi có yêu cầu `pending` của đúng owner và workflow (mục 3.0). Ghi cờ trên DO, đánh yêu cầu `approved`. Không tự điền `enterpriseId`. `enterpriseAcceptance = none`.
- List `GET /shared` hết thấy workflow khi bản D1 đã có cờ. Trước đó hook vẫn 404 vì đọc DO.
- `false` khi `enterpriseAcceptance` là `none` hoặc `pending`: xóa cờ, `enterpriseId`, acceptance trên DO. Xóa grant và credential trên D1.
- `false` khi `enterpriseAcceptance = accepted`: 409 `ENTERPRISE_ACCEPTED`, trừ khi body có `force: true`. `force` ghi audit, xóa cờ, tổ chức, acceptance, grant, credential, **và đặt `isShared = false`**. Workflow không rơi lại catalog công khai. Muốn public lại, owner bật share sau, bằng một thao tác riêng.

Member `PUT /workflows/:id` gửi `isEnterprise` → 403 `ENTERPRISE_FLAG_FORBIDDEN`. Không bỏ qua field.

Owner không xóa được workflow khi `enterpriseAcceptance` là `pending` hoặc `accepted` → 409 `ENTERPRISE_ACCEPTED`. Business từ chối hoặc nhả trước. Admin `force` tắt cờ thì owner xóa được.

### 3.2 Đề nghị và chấp nhận

Owner `PUT` workflow của mình: `{ enterpriseId: string | null }`.

Gửi id khi tất cả đúng:

- Hàng này `isEnterprise = true`. Chưa bật cờ → 403 `ENTERPRISE_FLAG_REQUIRED`.
- Tổ chức tồn tại và `status = active` (kể cả đang trong 7 ngày gia hạn ghế). `pending`, `suspended`, `adminHold` → 403 `ENTERPRISE_NOT_ACTIVE`.
- Đúng một id.

Kết quả là `enterpriseAcceptance = pending`. Workflow **chưa** hiện với thành viên. Grant và credential cũ của workflow bị xóa.

`enterpriseId: null` khi đang `pending`: owner rút đề nghị. Khi đang `accepted`: 409. Chỉ Business nhả được workflow đã chấp nhận (`POST …/release`), hoặc admin `force`.

Người tạo không cần là thành viên. Gửi đề nghị không biến họ thành thành viên và không cho họ quyền trên catalog tổ chức.

User Business của đúng tổ chức:

| Việc | Hệ quả |
|------|--------|
| Chấp nhận | `enterpriseAcceptance = accepted` và đóng băng `acceptedRoyaltyPercent` bằng mức đã ghi trên đề nghị (`WORKFLOW_ROYALTY_PERCENT` lúc owner gửi). Workflow vào khối tổ chức của Business. Pro vẫn chưa thấy cho đến khi có grant |
| Từ chối đề nghị `pending` | Xóa `enterpriseId`, acceptance về `none`, xóa grant |
| Nhả workflow đã `accepted` | Như từ chối, cộng xóa credential. Owner giữ graph và cờ enterprise, có thể đề nghị tổ chức khác |

Đề nghị `pending` chỉ owner và user Business của tổ chức đó thấy (hàng “chờ chấp nhận”). Hàng này ghi mức royalty người tạo sẽ nhận: “mỗi lần người khác chạy, người chạy trả thêm X% usage cho người tạo”. X là `WORKFLOW_ROYALTY_PERCENT` lúc đề nghị được gửi. Business chấp nhận thì X được ghi vào `acceptedRoyaltyPercent` và không đổi khi admin sửa tỷ lệ nền tảng sau đó. Pro không thấy đề nghị.

### 3.3 Ai nhìn thấy

Catalog công khai (`GET /shared` và tab workflow công khai) luôn loại `isEnterprise = 1`. Thiếu hàng trả 404, không 403.

Khối **Tổ chức** trên màn cộng đồng đọc `GET /dashboard/build/workflows/enterprise`, không trộn vào response `/shared`.

Hiện trong khối đó khi:

```
isEnterprise = true
AND isShared = true
AND status = published
AND enterpriseAcceptance = accepted
AND enterpriseId = tổ chức của người gọi
AND tổ chức status = active
```

Và thêm một cửa theo ghế:

| Người gọi | Thấy workflow nào |
|-----------|-------------------|
| Business đang hiệu lực của tổ chức | Mọi workflow đã `accepted` |
| Pro đang hiệu lực | Chỉ workflow đã `accepted` mà mình có **ít nhất một** grant còn hiệu lực |
| Pro chưa được cấp trigger nào | Không thấy card, không thấy tên hay mô tả |
| Free, Starter, user ngoài tổ chức | Không thấy |

Owner thấy workflow trong dashboard của mình ở mọi acceptance. Owner **không** kích hoạt production (webhook, form, chat công khai, cron, execute production) khi tổ chức `suspended` hoặc khi workflow đã `accepted` mà caller không đi qua cửa mục 3.5. Editor, bản nháp và lần chạy test trên canvas của owner vẫn mở. Test không gọi URL công khai và không chạy cron.

Thành viên không sửa definition. Definition đầy đủ nằm ở owner. List enterprise không trả definition; chỉ tên, mô tả, tag, ước lượng Credit và các trigger người gọi được phép dùng.

`minPlanId` không áp thêm. Người chạy trả từ ví của mình. Không có ví chung của tổ chức.

Royalty ghi bằng [`royalty.ts`](../workers/auth-worker/src/features/member/workflows/billing/royalty.ts), cùng đường với workflow công khai: sổ trên UserDO của người tạo, queue chiếu `workflow_royalties`, `d1tor2` archive sang R2. Không insert royalty thẳng vào D1. Mức là `acceptedRoyaltyPercent` đã đóng băng. Người tạo tự chạy thì royalty = 0. Hub không lấy phần royalty khỏi COGS.

Business có thể đặt `monthlyCreditCap` trên từng Pro cho một workflow; `null` là không trần. Trần tính trên tổng rời ví của Pro đó cho workflow này trong tháng UTC, gồm usage và royalty. Vượt trần → 402 `ENTERPRISE_CREDIT_CAP`.

Comment và star không áp dụng.

### 3.4 Chỗ lọc bắt buộc

| Cửa | Điều kiện |
|-----|-----------|
| [`listSharedWorkflowsFromD1`](../workers/auth-worker/src/features/member/workflows/infrastructure/infrastructure.ts) | `isEnterprise = 0` trên bản D1. Bản này trễ hơn DO đến khi queue flush |
| Hook, form, chat public, execute shared, comment, star | Đọc workflow trên **UserDO của owner**. `isEnterprise` thì 404. Không dùng bản D1 để cho chạy |
| `POST /hooks/enterprise/:token` | Credential trên D1, rồi đọc definition trên UserDO của owner để kiểm tra key còn trên graph. Tổ chức không `active` → 403 `ENTERPRISE_SUSPENDED` |
| Execute / chat trong app | Session + grant trên D1. Definition và cờ lấy từ UserDO của owner |

Không ghi cờ lên D1 từ request bật cờ. Queue upsert cả dòng `agent_workflows`. Ghi D1 tay sẽ bị message cũ đè.

### 3.5 User Business phân quyền trigger cho user Pro

Trong tổ chức `active`, user **Business** đang hiệu lực cấp và thu hồi trigger cho từng user **Pro** đang hiệu lực của cùng tổ chức, trên workflow đã `accepted`. User Pro không cấp cho nhau. Platform admin không cấp thay.

Grant gắn một `enterpriseTriggerKey`, không gắn id canvas, không gắn kind.

```ts
type EnterpriseTriggerGrant = {
  enterpriseId: string;
  workflowOwnerId: string;
  workflowId: number;
  granteeUserId: string;
  /** UUID trên node.data.enterpriseTriggerKey. Không có giá trị '*'. */
  triggerKey: string;
  /** null = không trần. Credit tối đa / tháng UTC rời ví Pro cho workflow này, gồm usage và royalty. */
  monthlyCreditCap?: number;
};
```

PUT ghi cùng một `monthlyCreditCap` lên mọi dòng của Pro đó trên workflow. Trần so với tổng usage của user trên cả workflow trong tháng UTC, không tách theo từng key.

Ô **Tất cả** trên sheet chỉ là cách chọn mọi key **đang có lúc bấm lưu**. Server ghi một dòng cho từng key. Không lưu wildcard. Owner thêm webhook ngày hôm sau thì Pro chưa được cấp key mới đó, kể cả người vừa được “tất cả”. Business mở sheet và cấp key mới nếu muốn.

| Người xem trên khối Tổ chức | Nút trigger |
|-----------------------------|-------------|
| Business của tổ chức | Mọi trigger graph đang có trên workflow đã chấp nhận |
| Pro có vài `triggerKey` | Chỉ các key đó. Ví dụ chỉ chat; hoặc chỉ một form; hoặc một webhook |
| Pro không có key nào của workflow | Không có card |
| User khác | Không có card |

Ví dụ workflow đã chấp nhận, có chat, một form và một webhook:

- Pro A chỉ có key chat → card chỉ **Mở chat**, kèm credential của đúng key đó.
- Pro B chỉ có key form → chỉ nút form.
- Pro C được lưu “tất cả” tại lúc graph có ba node → ba nút. Node thứ tư thêm sau không xuất hiện cho C.

Sheet của Business liệt kê user Pro và checkbox theo trigger hiện có. Bỏ hết ô của một người thì xóa grant và credential của người đó trên workflow. Chỉ Business của đúng `enterpriseId` đang `accepted` được ghi. Mỗi lần ghi grant thêm một dòng `enterprise_events`.

**Cách kích hoạt.** URL công khai của owner tắt suốt thời gian `isEnterprise`. Mỗi grant (và mỗi trigger Business tự dùng từ bên ngoài) có một credential riêng:

- Trong app, nút trên card gọi API bằng session. Server kiểm tra grant hoặc ghế Business.
- Hệ thống bên ngoài gọi `POST /hooks/enterprise/:token`. Token map tới một user + một `triggerKey`. Token lưu dạng hash, bản rõ chỉ trả **một lần** lúc tạo hoặc lúc Business bấm cấp lại. Thu hồi grant thì xóa token.
- Form và webhook dùng token này. Chúng không nhận cookie và không nhận URL `/hooks/workflows/…` cũ.
- Schedule: cron của owner **không** chạy khi workflow là enterprise. Grant schedule cho phép user đó gọi cùng trigger bằng session hoặc token của mình. Không tạo cron riêng cho từng Pro, không sửa biểu thức cron của owner.
- Owner đứng ngoài tổ chức không có token và không có cron production cho workflow này. Lần chạy test trên canvas của owner không đi qua URL công khai.

Grant có hiệu lực chỉ khi đồng thời: `grant.enterpriseId = workflow.enterpriseId`, `enterpriseAcceptance = accepted`, tổ chức `status = active`, người được cấp còn là thành viên Pro đang hiệu lực, và `triggerKey` còn nằm trên definition. Gỡ thành viên, đổi tổ chức của workflow, từ chối, nhả, hoặc tắt cờ → **xóa** grant và credential. Hết kỳ rồi `suspended` thì grant không hiệu lực, nhưng không xóa. Kỳ sau trả thành công và user vẫn trên roster thì grant cũ dùng lại.

Node bị xóa khỏi graph: key biến mất, grant của key đó vô hiệu. Tạo node mới không kế thừa key đã xóa.

---

## 4. API

Prefix auth-worker, session như các route dashboard khác. Admin route đi `requireAdmin`.

### 4.1 Admin — tổ chức

| Method | Path | Body / việc |
|--------|------|-------------|
| GET | `/dashboard/admin/enterprises` | Danh sách: tên, status, `periodEnd`, `seatGraceUntil`, `minProSeats`, `billableBusiness` / `billablePro`, `activeBusiness` / `activePro`, số workflow `pending` và `accepted` |
| POST | `/dashboard/admin/enterprises` | `{ name, minProSeats, note? }` → `pending` |
| PATCH | `/dashboard/admin/enterprises/:id` | `{ name?, minProSeats?, note?, adminHold? }`. Sửa `minProSeats` **không** đổi `status` — ngưỡng chỉ chặn hóa đơn sau. Đổi `adminHold` áp mục 2.4 ngay |
| DELETE | `/dashboard/admin/enterprises/:id` | 409 nếu còn workflow `pending` hoặc `accepted` |
| POST | `/dashboard/admin/enterprises/:id/members` | `{ userId, seatRole: 'business' \| 'pro' }` |
| DELETE | `/dashboard/admin/enterprises/:id/members/:userId` | Gỡ. Nếu `planSource = enterprise` thì `planId` về `free`. Xóa grant và credential. Không hoàn kỳ đang trả. 409 nếu đây là ghế `business` cuối cùng và tổ chức còn workflow `accepted` — gỡ hết workflow trước, vì không còn ai trả kỳ sau |
| GET | `/dashboard/admin/enterprise-flag-requests` | Yêu cầu `pending`: owner, tên workflow, status, `isShared`, note, thời điểm |
| GET | `/dashboard/admin/enterprise-flag-requests/:id` | Definition đọc từ UserDO của owner, để mở canvas chỉ xem |
| POST | `/dashboard/admin/enterprise-flag-requests/:id/approve` | Bật cờ như `PUT` `isEnterprise: true` |
| POST | `/dashboard/admin/enterprise-flag-requests/:id/reject` | `{ reason }`. Không bật cờ |
| PUT | `/dashboard/admin/workflows/:ownerId/:workflowId/enterprise` | `{ isEnterprise: false, force?: boolean }` để tắt cờ. `true` không kèm yêu cầu `pending` → 409 |

Mọi đổi ghế, đổi acceptance, ghi grant, và `force` ghi `enterprise_events` `{ id, enterpriseId, type, payload, actorId, createdAt }`.

### 4.2 Thành viên — catalog và chạy

| Method | Path | Việc |
|--------|------|------|
| GET | `/dashboard/build/workflows/enterprise` | Khối Tổ chức. Business: workflow `accepted` + hàng đề nghị `pending`. Pro: chỉ workflow `accepted` mình có grant. `triggers` đã cắt. Không đủ điều kiện → `{ workflows: [], proposals: [] }`. Tên, mô tả và danh sách `triggerKey` của mỗi workflow đọc bản chiếu D1 — một query, không đọc UserDO của từng owner. Cắt theo grant bằng join `enterprise_trigger_grants`. UserDO của owner chỉ đọc lúc execute |
| POST | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/accept` | Business chấp nhận đề nghị `pending` |
| POST | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/reject` | Business từ chối `pending` |
| POST | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/release` | Business nhả workflow `accepted`. Xóa grant và credential |
| PUT | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/grants` | Business. Body `{ granteeUserId, triggerKeys: string[], monthlyCreditCap?: number \| null }`. Không nhận `*`. Mảng rỗng = xóa grant và credential của user này. Response gồm token bản rõ **một lần** cho từng key mới |
| GET | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/grants` | Business. Pro của tổ chức, key đang có trên graph, grant hiện có. Không trả token bản rõ |
| POST | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/credentials` | Business tạo token cho chính mình trên một `triggerKey` của workflow `accepted`, để hệ thống bên ngoài gọi |
| POST | `/dashboard/build/workflows/enterprise/:ownerId/:workflowId/execute` | Session. Body có `triggerKey`. Business của tổ chức, hoặc Pro có grant key đó |
| POST | `/hooks/enterprise/:token` | Credential. Chạy đúng một `triggerKey`. URL công khai cũ của workflow enterprise trả 404 |

### 4.2b Kỳ thanh toán của tổ chức

Chỉ user có `seatRole = business` của tổ chức đó.

| Method | Path | Việc |
|--------|------|------|
| GET | `/dashboard/enterprises/mine/billing` | `periodEnd`, interval, ghế tính tiền, ghế “đang tự trả”, số tiền kỳ tiếp theo theo 1/3/6/12, hóa đơn `pending` nếu có |
| POST | `/dashboard/enterprises/mine/billing/checkout` | `{ interval: 1 \| 3 \| 6 \| 12 }`. Khóa roster ghế tính được tiền. 403 nếu thiếu ngưỡng hoặc người gọi không nằm trong roster Business. 409 nếu đã có hóa đơn `pending` hoặc `periodEnd` đã xa hơn một kỳ. Trả `approvalUrl` hoặc hướng dẫn Casso |
| POST | `/dashboard/enterprises/mine/billing/checkout/:invoiceId/cancel` | Hủy hóa đơn `pending` |
| POST | `/dashboard/enterprises/mine/billing/seats` | `{ userId }`. Prorate mục 2.5 đến `periodEnd` hiện tại. 403 nếu chưa có kỳ trong tương lai, user đang tự trả, hoặc đã nằm trong kỳ. 409 nếu đang có hóa đơn `pending` |

Capture không ghi thẳng bảng `users` trên D1. Áp plan bằng cách ghi UserDO của từng user trong roster đã khóa, với đúng `periodEnd` đã lưu trên hóa đơn.

`kind = 'period'` đẩy `periodEnd` của tổ chức. `kind = 'seat'` **không** đụng `periodEnd`; nó chỉ bật một ghế đến mốc đang có.

```
capture(invoiceId):
  nếu status != paid:
    nếu kind = 'period': tính periodEnd một lần, ghi vào hóa đơn và enterprises
    nếu kind = 'seat':   periodEnd của hóa đơn = periodEnd hiện tại của tổ chức
    status = paid, applied_user_ids = []
  với mỗi user trong roster đã khóa mà chưa có trong applied_user_ids:
    nếu user không còn là thành viên → bỏ qua, ghi enterprise_events
    ghi planId, planSource = enterprise, planStatus, planCurrentPeriodEnd trên UserDO của user đó
    thêm userId vào applied_user_ids
```

Rớt giữa chừng thì gọi lại cùng `invoiceId`; nhánh tính `periodEnd` không chạy lần nữa. Hai capture đồng thời không cộng kỳ hai lần vì lần thứ hai thấy `status = paid`. Admin gỡ một người sau lúc khóa roster thì capture không bật plan cho họ, và không hoàn phần tiền đó.

Khoản tiền tạo `orders` và `payments` trên UserDO của người trả, gắn `invoiceId`, để đi queue → D1 → R2 như mọi thanh toán khác. `enterprise_invoices` là chỉ mục tổ chức trên D1, không thay sổ đó.

Webhook subscription cá nhân không ghi đè user `planSource = enterprise`. Checkout gói lẻ của user đó trả 403 `ENTERPRISE_PLAN_MANAGED`.

Owner đề nghị tổ chức qua `PUT /workflows/:id` với `enterpriseId`. Gửi kèm `isEnterprise` → 403. Xin bật cờ qua `POST /dashboard/build/workflows/:id/enterprise-flag-request`. Rút yêu cầu đang `pending`: `DELETE` cùng path.

### 4.3 Lưu trữ

D1, không nhét vào UserDO organization:

```sql
CREATE TABLE enterprises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_pro_seats INTEGER NOT NULL,
  status TEXT NOT NULL,        -- 'pending' | 'active' | 'suspended'
  seat_grace_until TEXT,
  admin_hold INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  period_end TEXT,
  plan_interval INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE enterprise_members (
  enterprise_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat_role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (enterprise_id, user_id)
);

CREATE UNIQUE INDEX enterprise_members_one_org ON enterprise_members(user_id);

CREATE TABLE enterprise_trigger_grants (
  enterprise_id TEXT NOT NULL,
  workflow_owner_id TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  grantee_user_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  monthly_credit_cap REAL,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workflow_owner_id, workflow_id, grantee_user_id, trigger_key)
);

CREATE INDEX enterprise_trigger_grants_grantee
  ON enterprise_trigger_grants(grantee_user_id, enterprise_id);

CREATE TABLE enterprise_trigger_credentials (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  workflow_owner_id TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  grantee_user_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX enterprise_trigger_credentials_token
  ON enterprise_trigger_credentials(token_hash);

CREATE TABLE enterprise_invoices (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  payer_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,          -- 'period' | 'seat'
  plan_interval INTEGER NOT NULL,
  amount_usd REAL NOT NULL,
  period_start TEXT,
  period_end TEXT,
  roster_json TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'pending' | 'paid' | 'cancelled' | 'expired'
  applied_user_ids TEXT NOT NULL DEFAULT '[]',
  order_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE enterprise_flag_requests (
  id TEXT PRIMARY KEY,
  workflow_owner_id TEXT NOT NULL,
  workflow_id INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX enterprise_flag_requests_pending
  ON enterprise_flag_requests(status, created_at);

CREATE TABLE enterprise_events (
  id TEXT PRIMARY KEY,
  enterprise_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

`agent_workflows` và `users` chỉ sửa trên UserDO. Cột enterprise của workflow nằm trong hàng DO và lên D1 khi queue-worker upsert. Không có ghi D1 song song.

```sql
-- cột thêm trên UserDO agent_workflows, rồi để queue chiếu
isEnterprise INTEGER NOT NULL DEFAULT 0,
enterpriseId TEXT,
enterpriseAcceptance TEXT NOT NULL DEFAULT 'none',
acceptedRoyaltyPercent REAL
```

`enterpriseTriggerKey` nằm trong JSON `definition` trên UserDO. Execute đọc definition từ DO đó, không từ bản D1.

Các bảng tổ chức ở mục trên (`enterprises`, `enterprise_members`, grant, credential, invoice, flag request, event) **không** thêm vào `SYNC_TABLE_NAMES` của queue-worker và **không** thêm vào pipeline `d1tor2`. Queue không được upsert chúng. Cron archive không được xóa chúng. Credential mà bị archive rồi xóa khỏi D1 thì `POST /hooks/enterprise/:token` gãy.

Sổ tiền và royalty không nằm ở các bảng đó. Chúng đi `orders`, `payments`, `workflow_royalties` trên UserDO, đúng đường đang archive sang R2. `enterprise_invoices.order_id` trỏ tới order của người trả.

Usage để so `monthlyCreditCap` đọc `service_usages` còn trên D1. Bản đã archive thì đọc không cần cho trần tháng đang chạy, vì retention dài hơn một tháng. Không mở ví tổ chức.

---

## 5. Trang tĩnh

Bốn card self-serve giữ nguyên cho người dùng lẻ, vẫn đọc `GET /public/plans`. Enterprise không thêm card giá cố định và không có checkout trên trang marketing.

Thêm một khối “gói tổ chức”. Copy nói rõ: user Business trả một khoản mỗi kỳ cho mọi ghế Pro và Business của tổ chức, kỳ 1/3/6/12 tháng cùng chiết khấu gói lẻ; thành viên không tự gia hạn; thiếu kỳ mới thì còn 7 ngày.

| Trang | Việc |
|-------|------|
| [`/packages`](../workers/web/src/app/(external)/pages/packages.tsx) + [`plan-catalog.tsx`](../workers/web/src/app/(external)/components/packages/plan-catalog.tsx) | Dưới 4 card: một khối Enterprise, không số giá cố định. Bullet: một kỳ cho cả roster, chiết khấu 3/6/12 tháng, user Business thanh toán trong dashboard, thành viên không tự trả gói. CTA không checkout. Footer “SLA / SSO” là một dòng phụ |
| Home [`packages-preview.tsx`](../workers/web/src/app/(external)/components/home/packages-preview.tsx) | Một dòng + link “Enterprise cho tổ chức” → `/packages#enterprise` hoặc `/docs/enterprise` |
| [`/docs/enterprise`](../workers/web/src/app/(external)/pages/docs/enterprise.tsx) | Viết lại: user Business trả một kỳ cho mọi ghế, gia hạn kỳ sau áp cả roster, 7 ngày nếu chưa trả, chấp nhận workflow, credential từng trigger. SLA/SSO/BYOK ở mục “Ngoài phạm vi gói này” |
| [`/docs`](../workers/web/src/app/(external)/pages/docs/index.tsx) và `docs-nav.ts` | Giữ link; sửa mô tả ngắn cho khớp |
| `/about`, home CTA | Nhắc Enterprise là tổ chức, không phải giá thứ năm |
| `/support` FAQ | Một câu: workflow enterprise không nằm catalog công khai; muốn tổ chức thì `/contact` |
| `/terms` | Một câu: kỳ tổ chức là một khoản do user Business trả cho mọi ghế đến `periodEnd`; không tự trừ từng thành viên; không hoàn khi gỡ ghế giữa kỳ |
| `/contact` | Topic `enterprise` giữ. Prefill `?topic=enterprise` nếu query có |
| `/community` | Một câu: catalog công khai không chứa workflow tổ chức; thành viên thấy khối riêng sau khi tổ chức chấp nhận |
| i18n `en-US.json` / `vi-VN.json` | `PackagesPage.layers.enterprise`, `Docs.enterprise.*`, FAQ. Không hard-code `n` cụ thể — copy nói “số user Pro do hợp đồng / admin đặt” |

Card Enterprise không có giá `$` cố định và không có `checkout=` trên trang marketing. Chọn kỳ và trả tiền nằm ở dashboard của user Business.

---

## 6. Việc không làm trong v0.4

- Không `planId = enterprise`. Ghế tổ chức ghi `planId` là `pro` hoặc `business` và `planSource = enterprise`. Không parse nhầm hàng legacy `enterprise` (spec gói đã map sang `business` khi đọc).
- Không ví Credit chung của tổ chức. Khoản một cục là phí ghế, không phải Credit. Usage trừ ví người chạy. Trần tháng, nếu có, là `monthlyCreditCap` trên grant.
- Không tự gia hạn PayPal Subscriptions cho tổ chức. Mỗi kỳ là một lần trả. Không có hai hóa đơn `pending` cùng lúc.
- Webhook gói lẻ không sửa plan của user `planSource = enterprise`.
- Không SSO, SLA, BYOK, hóa đơn công ty, quota hạ tầng riêng.
- Không để thành viên sửa graph hoặc publish hộ owner.
- Không gắn một workflow đã chấp nhận cho nhiều tổ chức.
- Không để người tạo tự bật `isEnterprise`, tự chấp nhận đề nghị, hoặc xóa workflow khi tổ chức đang giữ.
- Không grant wildcard, không grant theo id canvas, không để cron/URL công khai của owner chạy song song với credential.

---

## 7. Tiêu chí chấp nhận

**Tổ chức**

- [ ] Admin tạo tổ chức với `minProSeats = n` → `pending`. Chưa thanh toán thì chưa có catalog.
- [ ] User Business không bị loại trả một hóa đơn. Tiền bằng `prepaidUsd` nhân ghế **trong hóa đơn**, không nhân người “đang tự trả”. Mọi user trong hóa đơn có `planSource = enterprise` và cùng `periodEnd`. Tổ chức `active`.
- [ ] User PayPal cá nhân `active` không nằm trong hóa đơn và không bị trừ lần hai. Mọi ghế Business đều đang tự trả → không tạo được hóa đơn.
- [ ] Đang có hóa đơn `pending` thì checkout thứ hai trả 409. Hủy hoặc sau 24 giờ thì tạo được hóa đơn mới.
- [ ] Trả khi kỳ còn hạn nối `periodEnd` thêm đúng một kỳ. `periodEnd` đã xa hơn một kỳ → 409. Thêm ghế sau lần trả sớm: prorate bằng phần ngày còn lại của kỳ đang chạy cộng một kỳ đầy đủ đã trả trước, và `periodEnd` không đổi.
- [ ] Hết `periodEnd` chưa trả → grace 7 ngày, catalog vẫn chạy. Hết grace → `suspended`, các `planSource = enterprise` về `free`. Grace không bật vì roster tụt dưới `n`.
- [ ] Gỡ ghế giữa kỳ không hoàn, user đó về `free` nếu plan đến từ tổ chức, catalog vẫn `active` đến `periodEnd`.
- [ ] `adminHold` tắt catalog và trigger ngay, `planId` còn đến hết kỳ hoặc hết grace. Gỡ hold trong kỳ thì catalog mở lại.
- [ ] User `planSource = enterprise` checkout gói lẻ → 403. Webhook PayPal cá nhân không đổi plan của user đó.
- [ ] Một user không đứng trong hai tổ chức. Gỡ thành viên xóa grant và credential của họ.

**Workflow**

- [ ] Workflow thường (`isEnterprise` false) vẫn list/chạy/comment/star như hiện tại.
- [ ] Owner xin bật cờ. Admin mở canvas chỉ xem trên UserDO của owner. Chấp nhận chỉ sửa DO. Hook, form và execute đọc DO và trả 404 ngay, kể cả khi `GET /shared` chưa kịp mất hàng. Không có `UPDATE` D1 `agent_workflows` trong request bật cờ.
- [ ] Capture hóa đơn ghi `paid` và `periodEnd` một lần, rồi ghi plan lên UserDO từng user. Gọi capture lần hai không đổi `periodEnd`. User chưa có trong `applied_user_ids` được ghi nốt. Có `orders` / `payments` trên DO của người trả.
- [ ] Owner gửi `isEnterprise` nhận 403. Owner không xóa được workflow đang `pending` hoặc `accepted`.
- [ ] Owner đề nghị một tổ chức `active`. Thành viên chưa thấy workflow. Business chấp nhận thì Business thấy trong khối Tổ chức. Business từ chối thì đề nghị biến mất.
- [ ] Pro không thấy workflow chưa có grant. Sau khi được cấp key chat thì chỉ thấy nút chat. Cấp “tất cả” lúc có 3 trigger thì có 3 nút; thêm webhook sau không xuất hiện cho đến khi Business cấp key mới.
- [ ] Response không chứa token hay URL của trigger chưa cấp. `POST /hooks/enterprise/:token` sai hoặc đã thu hồi trả 404. Token đúng khi tổ chức `suspended` trả 403.
- [ ] Đề nghị cho Business thấy % royalty. Chấp nhận đóng băng `acceptedRoyaltyPercent`. Pro chạy sau đó trả thêm đúng %, người tạo nhận earnings. Người tạo tự chạy thì royalty = 0. Đổi tỷ lệ nền tảng không đổi mức đã chấp nhận.
- [ ] Vượt `monthlyCreditCap` (usage cộng royalty) trả 402.
- [ ] Admin tắt cờ khi đã `accepted` mà không `force` → 409. `force` đặt `isShared = false` và xóa grant, workflow không hiện lại trên catalog công khai.
- [ ] User Pro không ghi grant. Đổi tổ chức của workflow xóa grant cũ.

**Trang tĩnh**

- [ ] `/packages` vẫn 4 giá self-serve. Khối Enterprise không có giá cố định và không checkout trên trang đó. Copy nói user Business trả một kỳ cho cả roster.
- [ ] `/docs/enterprise` mô tả đúng v0.4, CTA liên hệ.
- [ ] Copy en và vi khớp.

---

## 8. Phase code gợi ý

1. D1 cho bảng tổ chức ở `workers/queue-worker/migrations/019_enterprise.sql` (không đưa vào `SYNC_TABLE_NAMES`, không đưa vào `d1tor2`). Cột workflow ở `020_agent_workflows_enterprise.sql` và trong `AgentWorkflowSchema` (UserDO tự thêm cột qua `ensureSchemaColumns`). `planSource = 'enterprise'` giữ plan đến `planCurrentPeriodEnd` + 7 ngày.
2. Hóa đơn một kỳ, `periodEnd` khóa lúc `paid`, áp từng UserDO, idempotent theo `applied_user_ids`. Order và payment trên DO của người trả. Code ở `workers/auth-worker/src/features/enterprise/`. Hóa đơn tạo một `orders` ghi chú `enterprise:<invoiceId>` và người trả thanh toán order đó qua PayPal hoặc Casso như order thường (`checkoutPath` = `/dashboard/control/billing?payOrder=…`). Cổng thanh toán từ chối order mà `order_id`, người trả hoặc số tiền không khớp hóa đơn. Cron `7 * * * *` hết hạn hóa đơn treo, chạy nốt lần áp ghế bị rớt, và settle hóa đơn có `payments` `COMPLETED`. Xóa tổ chức còn thành viên → 409 `ENTERPRISE_HAS_MEMBERS`.
3. Hàng chờ xin bật cờ, canvas admin đọc DO, hook/form/execute đọc DO. List D1 lọc `isEnterprise = 0` khi bản chiếu đã có cờ. Code ở `features/enterprise/workflow-flag.ts`. Owner gọi `GET`/`POST`/`DELETE /dashboard/build/workflows/:id/enterprise-flag-request`; `GET` trả yêu cầu mới nhất kèm `reason`. D1 `021_enterprise_flag_request_one_pending.sql` giữ một yêu cầu `pending` mỗi workflow. Cửa công khai (execute/chat shared, chi tiết, comment, star, form/chat production, webhook, kênh, cron) đọc DO và trả 404; cron của owner bỏ qua workflow enterprise không retry. Lần chạy test trên canvas vẫn mở.
4. Đề nghị, chấp nhận, từ chối, nhả. Khối Tổ chức tách khỏi list `/shared`. Code ở `features/enterprise/workflow-proposal.ts`. Owner gửi `{ enterpriseId }` qua `PUT /dashboard/build/workflows/:id`; mức royalty lúc gửi được ghi sẵn vào `acceptedRoyaltyPercent` để Business thấy và chấp nhận đúng mức đó. Route Business mount ở `/dashboard/build/workflows/enterprise` trước router workflow. Chấp nhận cần tổ chức `active` và ghế Business đang hiệu lực; từ chối và nhả vẫn làm được khi tổ chức `suspended`. Royalty khi chạy đi qua `workflowAttribution.royaltyPercent`. Danh sách trigger trên card để phase 5.
5. `enterpriseTriggerKey` trên node. Grant theo key đã có lúc lưu, credential một lần, `POST /hooks/enterprise/:token`, trần Credit, tắt cron owner. Code ở `features/enterprise/trigger-keys.ts` và `triggers.ts`. Server gán key khi tạo, `PUT`, khôi phục version và lúc admin duyệt cờ; key giữ theo node id nên canvas lưu bản cũ không làm đổi key, node sao chép nhận key mới. Node có key: webhook (trigger/core), chat, form (không gồm form database), schedule. Token dạng `ent_…`, lưu SHA-256; `POST …/credentials` với `granteeUserId` của Pro là cấp lại. Execute trong app và hook token chạy graph trên UserDO của owner với người gọi là actor, bỏ `minPlanId`. Trần tháng so `SUM(creditsCharged)` trên `service_usages` D1 từ đầu tháng UTC, kiểm trước khi chạy. Cron owner đã tắt từ phase 3.
6. Trang tĩnh và i18n. `/packages` có khối `#enterprise` dưới 4 card (không giá, CTA `/contact?topic=enterprise` và `/docs/enterprise`), dòng SLA/SSO là link phụ. Trang chủ thêm link tới `/packages#enterprise`. `/docs/enterprise` viết lại theo các mục tổ chức, một khoản mỗi kỳ, workflow của tổ chức, trigger và credential, ngoài phạm vi gói. `/contact` điền sẵn topic từ `?topic=`. Copy en/vi sửa ở `PackagesPage.layers.enterprise`, `PackagesPage.enterprise`, `Docs.enterprise.*`, `Docs.hub`, `Docs.platform`, About CTA, Support FAQ, Terms (dịch vụ và phí), Community.
