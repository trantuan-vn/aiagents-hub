/**
 * Cờ bật/tắt tính năng phía client.
 *
 * SMS_2FA_ENABLED: tạm tắt SMS 2FA vì dịch vụ gửi SMS tốn chi phí.
 * Khi có doanh thu đủ lớn để mua dịch vụ SMS, đổi về `true` (hoặc đặt
 * biến môi trường NEXT_PUBLIC_SMS_2FA_ENABLED="true") để hiện lại tùy chọn.
 */
export const SMS_2FA_ENABLED = process.env.NEXT_PUBLIC_SMS_2FA_ENABLED === "true";
