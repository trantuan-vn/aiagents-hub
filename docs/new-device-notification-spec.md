# Spec: Thông báo đăng nhập từ thiết bị mới

> **Trạng thái:** Draft v1 — sẵn sàng code  
> **Phiên bản:** 1.0  
> **Ngày:** 2026-10-13  
> **Phạm vi:** Quyết định gửi email "đăng nhập từ thiết bị mới", danh tính thiết bị (cookie / `device_id`), và việc giữ hay xóa trí nhớ đó khi đăng xuất  
> **Không nằm trong phạm vi:** Đổi mô hình WebSocket. Một tab một kết nối giữ nguyên

Chuẩn bám theo:

- **Auth0 Adaptive MFA — NewDevice:** thiết bị = cookie trình duyệt + user-agent. "Mới" nghĩa là chưa dùng tài khoản này trong 30 ngày. Phiên đăng nhập không phải danh tính thiết bị. Impossible travel và quốc gia lạ là tín hiệu riêng.
- **NIST SP 800-63B §4.6:** báo một lần khi gắn một yếu tố mới, qua kênh độc lập (email). Người dùng phải thu hồi được yếu tố đó. Không báo lại mỗi lần dùng yếu tố đã gắn.
- **OWASP Authentication / MFA cheat sheet:** cookie "nhớ trình duyệt", UA và IP chỉ là tín hiệu rủi ro. MFA ở lần đầu từ thiết bị hoặc vị trí lạ. Mail ghi giờ, trình duyệt, vị trí. Đăng xuất hủy phiên, không xóa trí nhớ thiết bị.

Sự cố cần hết: cùng Mac Safari, cùng IP `210.245.54.31`, mail ngày 8/10 và mail ngày 12/10. Mail Windows Edge ngày 9/10 là đúng và phải giữ.

---

## 0. Ba lớp không được trộn

| Lớp | Danh tính | Sống bao lâu | Việc của lớp này |
|------|-----------|--------------|------------------|
| Thiết bị | UUID trong cookie + `localStorage`, mọi tab cùng profile dùng chung | Khoảng 1 năm, gia hạn khi đăng nhập | Có gửi mail "thiết bị mới" hay không. Có bỏ qua step-up hay không |
| Phiên | `sessionId` (hash IP + UA + user) | Theo `SESSION_EXPIRY` | Quyền truy cập. Hết hạn hoặc đăng xuất thì phiên chết |
| WebSocket | `connectionId` ngẫu nhiên mỗi kết nối | Đến khi đóng tab | Đẩy realtime. Tab đầu thì user online, tab cuối đóng thì offline |

Năm tab Safari là một thiết bị, một phiên, năm WebSocket. Đóng tab không gửi mail và không xóa thiết bị đã ghi nhận.

`workers/web/src/core/use-ws.ts` đã là singleton trong một tab. `UserDO` đã đếm kết nối và chỉ `registerUser` ở kết nối đầu tiên. Spec này không sửa hai chỗ đó.

---

## 1. Hiện trạng và vì sao mail lặp

`decideNewSessionEmail` im khi còn một trong các điều kiện ngắn:

1. Còn phiên **active** đúng hash IP + UA (`sessionExisted`). Phiên ngày 8/10 đã chết trước ngày 12/10.
2. `device_id` còn trong `KnownDevice:{identifier}:{deviceId}`. `logoutUseCase` và `revokeSessionUseCase` gọi `forgetKnownDeviceIfUnused` ngay khi không còn phiên active. `logoutAllUseCase` xóa mọi `KnownDevice` của user, kể cả đăng xuất do user chủ động.
3. Không có `device_id` thì chỉ so UA với phiên **đang active**, cộng cooldown 12 giờ (`NEW_SESSION_EMAIL_COOLDOWN_SEC`). Bốn ngày sau cooldown hết.

UUID lạ không đối chiếu với hồ sơ `safari|macos` đã báo. `getOrCreateDeviceId` chỉ đọc `localStorage`. Cookie `client_device_id` được ghi trên origin web nhưng không được đọc lại. Hết `localStorage` là sinh UUID mới, header đè cookie, server coi là máy khác.

Giờ trong mail (`toLocaleString` không kèm `timeZone`) ra UTC trên Worker. 09:47 UTC và 16:47 ICT là cùng một lần đăng nhập.

File đang quyết định việc này:

| File | Vai trò hiện tại |
|------|------------------|
| `workers/auth-worker/src/features/auth/device-trust.ts` | `decideNewSessionEmail`, `markKnownDevice`, `forgetKnownDeviceIfUnused` |
| `workers/auth-worker/src/features/auth/session-fingerprint.ts` | UA family `browser\|os`, quốc gia lạ |
| `workers/auth-worker/src/features/auth/constant.ts` | Cooldown 12 giờ |
| `workers/auth-worker/src/features/auth/application.ts` | Gửi mail sau khi tạo phiên; xóa KnownDevice khi logout / revoke / logout-all |
| `workers/auth-worker/src/features/auth/infrastructure.ts` | Template Brevo, `loginTime` không có timezone |
| `workers/web/src/lib/device-id.ts` | UUID chỉ từ `localStorage` |
| `workers/auth-worker/src/shared/utils.ts` | Header thắng cookie |

---

## 2. Quy tắc gửi mail

Chỉ gửi khi **ghi nhận thiết bị lần đầu**, khi thiết bị đã im hơn 30 ngày, hoặc khi quốc gia lạ. Các lần còn lại im.

| Tình huống | Mail | Step-up (nếu account đã bật TOTP/SMS) |
|------------|------|----------------------------------------|
| Lần đầu Safari trên Mac | Gửi một lần, ghi nhận thiết bị | Bắt |
| Cùng Safari, đăng nhập lại trong 30 ngày, kể cả đã đăng xuất hoặc phiên hết hạn | Không | Bỏ qua nếu còn trong hạn nhớ step-up |
| Cùng Safari, IP đổi, cùng quốc gia | Không | Bỏ qua nếu còn trong hạn |
| Windows Edge | Gửi một lần | Bắt |
| Cùng Safari, quốc gia chưa từng thấy trên thiết bị này, hoặc impossible travel (luồng revoke sẵn có) | Gửi | Bắt |
| Mất cookie, nhưng UA + quốc gia khớp thiết bị dùng trong 30 ngày (partial match) | Không | Bắt, vì không có cookie |
| Không cookie và không khớp UA nào trong 30 ngày | Gửi một lần | Bắt |
| User đăng xuất một phiên, hoặc đăng xuất mọi phiên | Không xóa trí nhớ. Lần sau không gửi | Không xóa hạn nhớ step-up |
| Đổi mật khẩu, user gỡ thiết bị, logout vì lệch IP **và** UA, logout vì replay geo | Xóa trí nhớ thiết bị liên quan. Lần đăng nhập sau được gửi lại | Bắt lại |
| Safari không dùng quá 30 ngày | Gửi một lần, rồi gia hạn mốc 30 ngày | Bắt lại |

Cooldown 12 giờ chỉ chặn hai request song song ghi nhận cùng một thiết bị trước khi KV kịp ghi. Không dùng làm trí nhớ thiết bị.

Passkey: đăng ký passkey trên trình duyệt đang đăng nhập không gửi mail thêm. Đăng nhập passkey từ trình duyệt chưa ghi nhận vẫn gửi đúng một lần, trước khi `markKnownDevice`.

---

## 3. Danh tính thiết bị

### 3.1 Client

`getOrCreateDeviceId` lấy id theo thứ tự:

1. `localStorage["aiagents_client_device_id"]` nếu là UUID hợp lệ.
2. Cookie `client_device_id` trên origin web, nếu hợp lệ. Ghi ngược vào `localStorage`.
3. Sinh UUID mới, ghi cả `localStorage` và cookie web (`Path=/; Max-Age=31536000; SameSite=Lax; Secure` trên https).

SSR (`window` không có) không sinh id để gắn vào login. Header `X-Client-Device-Id` chỉ gắn từ trình duyệt.

### 3.2 Server chọn id

`getClientDeviceIdFromRequest` hôm nay lấy header trước, cookie sau. Đổi thành:

1. Header hợp lệ **và** đã ghi nhận cho account này → dùng header.
2. Ngược lại, cookie API-host hợp lệ **và** đã ghi nhận → dùng cookie. Header mới sinh sau khi mất `localStorage` bị bỏ qua.
3. Còn lại: header hợp lệ, rồi tới cookie, rồi tới không có id.

Response đăng nhập của auth worker set cookie trên chính host API (request đã `credentials: "include"`, cùng site `aiagents-hub.vn`):

```
Set-Cookie: client_device_id=<uuid>; Path=/; Max-Age=31536000; Secure; SameSite=Lax; HttpOnly
```

HttpOnly để script trên trang không đọc trộm. Client vẫn gửi bản trong `localStorage` qua header. Server mới là chỗ hòa giải khi hai bản lệch.

Không set `Domain=` rộng. Cookie host-only của API đủ cho các request credentialed tới API.

---

## 4. Bản ghi trên KV

Thay chỗ dùng `KnownDevice:{identifier}:{deviceId}` = `"1"` bằng một bản ghi có mốc thời gian. Prefix mới: `RecognizedDevice:{identifier}:{deviceId}`.

Giá trị JSON:

```json
{
  "uaFp": "safari|macos",
  "country": "VN",
  "firstSeenAt": "2026-10-08T09:47:31.000Z",
  "lastSeenAt": "2026-10-12T07:34:54.000Z",
  "stepUpTrustedUntil": "2026-11-07T07:34:54.000Z"
}
```

- TTL KV: 365 ngày, gia hạn mỗi lần đăng nhập thành công từ thiết bị đó (`KNOWN_DEVICE_TTL_SEC` giữ nguyên).
- `lastSeenAt` trong 30 ngày → không phải thiết bị mới.
- `stepUpTrustedUntil` = `now + 30 ngày`, gia hạn trượt mỗi lần đăng nhập thành công. Hết hạn thì step-up lại, mail vẫn im nếu `lastSeenAt` còn trong 30 ngày.
- Partial match: cùng `identifier`, có bản ghi `uaFp` trùng và `lastSeenAt` trong 30 ngày và `country` trùng (hoặc country hiện tại không đủ tin cậy). Không cần trùng `deviceId`.

Hằng số mới trong `constant.ts`:

- `RECOGNIZED_DEVICE_IDLE_SEC = 30 * 24 * 60 * 60`
- `STEP_UP_REMEMBER_SEC = 30 * 24 * 60 * 60`
- `NEW_SESSION_EMAIL_COOLDOWN_SEC` giữ 12 giờ, chỉ cho khóa chống gửi dồn `NewSessionEmailBurst:{identifier}:{deviceId|uaFp}`

`isNovelLoginCountry` đổi nguồn so sánh: quốc gia trên các `RecognizedDevice` còn hạn của user, không chỉ phiên active. Phiên active vẫn là tín hiệu bổ sung khi chưa có bản ghi nào. Country `XX` / `T1` / rỗng không tính là quốc gia mới.

Impossible travel giữ ở `verifySessionUseCase`. Spec này không thêm thuật toán mới. Khi nhánh đó đã `logoutAll`, lần tạo phiên tiếp theo thấy trí nhớ đã xóa nên được gửi mail.

---

## 5. Quyết định trong `decideNewSessionEmail`

Bỏ nhánh `sessionExisted → không gửi` như điều kiện duy nhất của "cùng máy". Cùng hash phiên vẫn không gửi (refresh đúng phiên đang sống), nhưng hết phiên không được mở lại cửa gửi mail.

Thứ tự:

1. `sessionExisted` → không gửi.
2. `deviceId` khớp `RecognizedDevice` còn `lastSeenAt` trong 30 ngày, và quốc gia không lạ → không gửi.
3. Không có id, nhưng partial match (mục 4) và quốc gia không lạ → không gửi.
4. Quốc gia lạ → gửi, kể cả thiết bị đã biết.
5. Còn lại → gửi nếu khóa burst 12 giờ chưa có.

Sau khi gửi thành công, ghi hoặc gia hạn `RecognizedDevice` và khóa burst. Gửi lỗi thì không ghi nhận, lần sau được gửi lại.

`markKnownDevice` sau `createUserSession` trở thành ghi `RecognizedDevice` (kể cả khi không gửi mail, để gia hạn `lastSeenAt` và `stepUpTrustedUntil`).

`evaluateNovelDeviceStepUp` trả step-up khi không có bản ghi với `stepUpTrustedUntil` còn hạn cho đúng `deviceId`. Partial match (có UA, không có cookie) vẫn step-up. Passkey login không gọi hàm này, giữ như hiện tại.

---

## 6. Khi nào xóa trí nhớ

| Sự kiện | Trí nhớ thiết bị | WebSocket |
|---------|------------------|-----------|
| Đóng tab | Giữ | Đóng đúng `connectionId` của tab |
| `logoutUseCase` / `revokeSessionUseCase` | Giữ. Bỏ `forgetKnownDeviceIfUnused` | Đóng socket của phiên đó, như hiện tại |
| `logoutAllUseCase` do user bấm đăng xuất mọi nơi | Giữ | `closeAllConnections`, như hiện tại |
| `logoutAllUseCase` từ lệch subnet IP **và** UA, hoặc replay geo | Xóa mọi `RecognizedDevice` của user | `closeAllConnections` |
| Đổi mật khẩu | Xóa mọi `RecognizedDevice` của user | Đóng mọi socket, như chính sách phiên hiện có |
| User gỡ một thiết bị trên màn phiên | Xóa đúng `deviceId` đó | Đóng các socket của các phiên mang `deviceId` đó |

`logoutAllUseCase` nhận lý do `'user' | 'security'`. Hai chỗ gọi từ `verifySessionUseCase` truyền `'security'`. Route đăng xuất mọi phiên của user truyền `'user'`.

Màn `/dashboard/control/account/sessions` thêm hành động "Gỡ thiết bị này" cạnh revoke phiên. Gỡ thiết bị xóa nhận diện, không chỉ tắt một phiên. Revoke một phiên giữ nhận diện.

v1 chưa làm link một lần "không phải tôi" có chữ ký trong mail. Mail trỏ tới trang phiên đã đăng nhập. Link một lần để ngoài phạm vi này.

---

## 7. Nội dung mail

`sendNewSessionEmail` gửi thêm param, giờ cố định múi `Asia/Ho_Chi_Minh` (template tiếng Anh dùng cùng múi, ghi rõ GMT+7):

| Param | Ví dụ |
|-------|--------|
| `deviceLabel` | `Safari trên macOS` |
| `location` | `VN` (nước từ CF; không suy thành phố nếu không có) |
| `ipAddress` | `210.245.54.31` |
| `loginTime` | `16:47 8/10/2026 GMT+7` |
| `sessionsUrl` | URL trang phiên trên `FRONTEND_URL` |

`deviceLabel` lấy từ `normalizeUaFingerprint`, không đưa nguyên chuỗi User-Agent vào mail. Template Brevo 3 (VI) và 4 (EN) sửa cho khớp các param này. Đổi template là một phần của việc code, không để mail cũ tiếp tục hiện UA thô và giờ UTC.

---

## 8. Việc không làm

- Không gom WebSocket các tab bằng SharedWorker.
- Không gắn mail với `connectionId` hay số tab.
- Không nhận thiết bị bằng IP. Ba mail sự cố cùng một IP; Edge và Safari phải vẫn là hai lần báo.
- Không kéo cooldown 12 giờ thành bộ nhớ dài ngày.
- Không tắt mail quốc gia lạ để hết spam.
- Không đổi hash phiên, hạn phiên, hay bước passkey bỏ step-up.

---

## 9. Kiểm thử

Sự cố thật, cùng account, country `VN`, không logout bảo mật:

1. 8/10 Safari macOS, IP `210.245.54.31`, `deviceId` A → gửi. Có `RecognizedDevice` `safari|macos`.
2. 9/10 Edge Windows, cùng IP, `deviceId` B → gửi.
3. 12/10 Safari macOS, cùng IP, cùng `deviceId` A, không còn phiên active → không gửi. `lastSeenAt` gia hạn.
4. 12/10 lại Safari, `localStorage` trống, header là UUID mới, cookie API vẫn là A → server chọn A → không gửi.
5. Đăng xuất phiên Safari rồi đăng nhập lại trong 30 ngày → không gửi, và không step-up nếu `stepUpTrustedUntil` còn hạn.
6. Safari, country `US`, trong khi bản ghi chỉ có `VN` → gửi, và step-up.
7. Không header, không cookie, UA Safari macOS, còn bản ghi bước 1 trong 30 ngày, country `VN` → không gửi, có step-up.
8. Cùng `deviceId` A nhưng `lastSeenAt` cũ hơn 30 ngày → gửi một lần.
9. `logoutAll` lý do `user` → bản ghi còn. Lý do `security` → bản ghi mất, lần login sau được gửi.
10. Hai tab Safari → một `deviceId`, hai `connectionId`. Không mail thêm khi mở tab thứ hai.

`device-trust.test.ts` sửa các case "đã mark known thì không mail" sang bản ghi có `lastSeenAt`. Thêm case partial match, country lạ, và idle quá 30 ngày.
