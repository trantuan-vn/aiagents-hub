# OpenAPI — API Keys & Đơn hàng (Dashboard)

Tài liệu rút gọn cho Ask AI và developer. Base URL dashboard: `BASE_URL` + `/dashboard`.

## API Keys (token)

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/dashboard/token/list` | Danh sách API keys (không trả raw secret). |
| POST | `/dashboard/token/create` | Tạo key mới. |
| DELETE | `/dashboard/token/revoke/:tokenId` | Thu hồi một key (`tokenId` là số). |
| DELETE | `/dashboard/token/revoke-all` | Thu hồi tất cả keys. |

### POST `/dashboard/token/create`

**Body (JSON)**

- `name` (string, bắt buộc): Tên hiển thị cho key.
- `permissions` (string[], tùy chọn): Quyền; mặc định có thể để `[]`.
- `expiresInDays` (number, tùy chọn): Số ngày hết hạn; có giới hạn max theo hệ thống.

**Response**: Trả về object có `rawToken` **một lần duy nhất** — lưu ngay; sau đó chỉ còn hash trên server.

## Đơn hàng (order)

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/dashboard/order/orders` | Tạo đơn. |
| GET | `/dashboard/order/orders` | Danh sách đơn (query: `status`, `targetType`, `page`, `limit`). |
| GET | `/dashboard/order/orders/:orderId` | Chi tiết đơn. |
| GET | `/dashboard/order/history` | Lịch sử (query: `fromDate`, `toDate` dạng `YYYY-MM-DD`, `limit`, `offset`). |
| PATCH | `/dashboard/order/orders/:orderId/status` | Cập nhật trạng thái. |
| POST | `/dashboard/order/orders/:orderId/cancel` | Hủy đơn. |

### POST `/dashboard/order/orders`

**Body (JSON)**

- `items` (array, bắt buộc): Mỗi phần tử:
  - `serviceId` (number, >0)
  - `basePrice` (number, ≥0)
  - `quantity` (number, ≥1)
- `currency` (string, tùy chọn): Mặc định thường là `VND`.
- `voucherCode` (string, tùy chọn)
- `notes` (string, tùy chọn)
- `paymentMethod` (string, tùy chọn)

**Lưu ý**: Cookie session dashboard phải hợp lệ (cùng origin / credentials).

## Gợi ý cho trợ lý

- Nếu user chưa cho `name` khi tạo API key → hỏi tên hoặc dùng form (type `form`) với field `name`.
- Nếu tạo đơn thiếu `items` hoặc thiếu `serviceId`/`basePrice`/`quantity` → thu thập qua form modal với đúng kiểu field (`number`).
