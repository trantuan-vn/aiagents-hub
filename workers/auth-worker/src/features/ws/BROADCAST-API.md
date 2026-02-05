# Broadcast API

Gửi thông báo real-time tới client qua WebSocket. Chỉ user có role `admin` mới gọi được.

## Endpoint

- **Method:** `POST`
- **Path:** `/dashboard/ws/broadcast`
- **Auth:** Bearer token (JWT), user phải là admin

## Request body (đầy đủ)

```json
{
  "message": {
    "title": "Tiêu đề thông báo",
    "body": "Nội dung chi tiết hiển thị trong notification."
  },
  "targetUsers": [],
  "priority": "normal",
  "expiresIn": 3600000
}
```

### Trường

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|--------|
| `message` | `object` hoặc `string` | Có | Nội dung gửi xuống client. Nên dùng object `{ title, body }` để notification hiển thị đúng. |
| `message.title` | string | Khuyến nghị | Tiêu đề thông báo (hiển thị trên UI). |
| `message.body` | string | Tùy chọn | Nội dung chi tiết (mô tả, link, v.v.). |
| `targetUsers` | string[] | Không | Danh sách `userId` (identifier) cần gửi. Để `[]` hoặc bỏ qua = gửi tất cả user đang kết nối. |
| `priority` | `"low"` \| `"normal"` \| `"high"` \| `"urgent"` | Không | Mặc định `"normal"`. |
| `expiresIn` | number (ms) | Không | Thời hạn broadcast tính bằng millisecond (ví dụ `3600000` = 1 giờ). |

### Ví dụ gửi tất cả user

```json
{
  "message": {
    "title": "Bảo trì hệ thống",
    "body": "Hệ thống sẽ bảo trì từ 02:00 - 04:00 ngày 10/02/2025. Vui lòng lưu dữ liệu trước đó."
  },
  "targetUsers": []
}
```

### Ví dụ gửi một số user cụ thể

```json
{
  "message": {
    "title": "Đơn hàng đã xác nhận",
    "body": "Đơn hàng #12345 của bạn đã được xác nhận."
  },
  "targetUsers": ["user-id-1", "user-id-2"],
  "priority": "high"
}
```

### Ví dụ message chỉ là chuỗi (vẫn hoạt động)

```json
{
  "message": "Thông báo nhanh dạng text.",
  "targetUsers": []
}
```

Client sẽ hiển thị với title mặc định "Thông báo" và body là chuỗi này.

## Response (thành công)

- **Status:** `200 OK`
- **Body:**

```json
{
  "broadcastId": 1,
  "status": "started",
  "config": { ... },
  "estimatedUsers": 1000,
  "queuePosition": 0
}
```

## Client (Web) nhận như thế nào

- WebSocket nhận frame dạng: `{ "event": "broadcast", "data": <message>, "timestamp": ... }`.
- Nếu `data` là object có `title` (và tùy chọn `body`): dùng làm notification.
- Nếu `data` là string: dùng làm body, title = "Thông báo".

## Lưu ý

- `targetUsers` để trống hoặc không gửi = broadcast tới mọi user đang online.
- Nên luôn dùng `message: { title, body }` để UI notification hiển thị đầy đủ.
