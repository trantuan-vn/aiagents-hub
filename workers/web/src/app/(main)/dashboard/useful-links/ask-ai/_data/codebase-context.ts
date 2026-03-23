/**
 * Phân tích codebase - context cho AI worker.
 * Dữ liệu được trích xuất từ auth-worker routes, schemas, và chức năng app.
 * Chạy script generate khi thay đổi API/schemas: pnpm run generate:ask-ai-context
 */
export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  category: string;
  schema?: Record<string, unknown>;
  queryParams?: string[];
}

export interface DbModel {
  name: string;
  description: string;
  fields: { name: string; type: string; required?: boolean }[];
  category: string;
}

export interface AppFeature {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoints: string[];
  actions: string[];
}

export interface CodebaseContext {
  apiEndpoints: ApiEndpoint[];
  models: DbModel[];
  features: AppFeature[];
  generatedAt: string;
}

export const codebaseContext: CodebaseContext = {
  generatedAt: new Date().toISOString(),
  apiEndpoints: [
    // Auth
    {
      method: "POST",
      path: "/dashboard/auth/login",
      description: "Đăng nhập",
      category: "auth",
      schema: { email: "string", password: "string" },
    },
    { method: "POST", path: "/dashboard/auth/signup", description: "Đăng ký", category: "auth" },
    { method: "GET", path: "/dashboard/auth/sessions", description: "Danh sách phiên đăng nhập", category: "auth" },
    { method: "POST", path: "/dashboard/auth/authenticator/setup", description: "Thiết lập 2FA", category: "auth" },
    { method: "GET", path: "/dashboard/auth/ekyc/status", description: "Trạng thái eKYC", category: "auth" },
    // Token (API Keys)
    { method: "GET", path: "/dashboard/token/list", description: "Danh sách API keys", category: "token" },
    {
      method: "POST",
      path: "/dashboard/token/create",
      description: "Tạo API key mới",
      category: "token",
      schema: { name: "string" },
    },
    { method: "DELETE", path: "/dashboard/token/revoke/:tokenId", description: "Thu hồi API key", category: "token" },
    // Order
    {
      method: "POST",
      path: "/dashboard/order/orders",
      description: "Tạo đơn hàng mới",
      category: "order",
      schema: { items: "array", currency: "string", voucherCode: "string?" },
    },
    {
      method: "GET",
      path: "/dashboard/order/orders",
      description: "Danh sách đơn hàng",
      category: "order",
      queryParams: ["status", "targetType", "page", "limit"],
    },
    { method: "GET", path: "/dashboard/order/orders/:orderId", description: "Chi tiết đơn hàng", category: "order" },
    {
      method: "GET",
      path: "/dashboard/order/history",
      description: "Lịch sử đơn hàng",
      category: "order",
      queryParams: ["fromDate", "toDate", "limit", "offset"],
    },
    {
      method: "PATCH",
      path: "/dashboard/order/orders/:orderId/status",
      description: "Cập nhật trạng thái đơn",
      category: "order",
      schema: { status: "string" },
    },
    // VNPay
    {
      method: "POST",
      path: "/dashboard/vnpay/create_payment_url",
      description: "Tạo URL thanh toán VNPay",
      category: "payment",
    },
    // Overview & Monitor
    { method: "GET", path: "/dashboard/overview", description: "Tổng quan dashboard", category: "overview" },
    {
      method: "GET",
      path: "/dashboard/monitor/logs",
      description: "Logs API",
      category: "monitor",
      queryParams: ["from", "to", "serviceId", "status", "limit"],
    },
    {
      method: "GET",
      path: "/dashboard/monitor/analytics",
      description: "Phân tích sử dụng",
      category: "monitor",
      queryParams: ["duration"],
    },
    // Admin - Policy, Service, Voucher
    { method: "GET", path: "/dashboard/admin/policy/get", description: "Danh sách price policy", category: "admin" },
    { method: "POST", path: "/dashboard/admin/policy/new", description: "Tạo policy mới", category: "admin" },
    { method: "GET", path: "/dashboard/admin/service/list", description: "Danh sách service", category: "admin" },
    { method: "POST", path: "/dashboard/admin/service/register", description: "Đăng ký service", category: "admin" },
    { method: "GET", path: "/dashboard/admin/voucher/vouchers", description: "Danh sách voucher", category: "admin" },
    { method: "POST", path: "/dashboard/admin/voucher/vouchers", description: "Tạo voucher", category: "admin" },
    // Stats
    { method: "GET", path: "/dashboard/admin/default-stats", description: "Thống kê mặc định", category: "stats" },
    { method: "GET", path: "/dashboard/admin/crm-stats", description: "Thống kê CRM", category: "stats" },
    { method: "GET", path: "/dashboard/admin/finance-stats", description: "Thống kê tài chính", category: "stats" },
    // Referral
    { method: "GET", path: "/dashboard/referral/link", description: "Link giới thiệu", category: "referral" },
    {
      method: "GET",
      path: "/dashboard/referral/commissions",
      description: "Hoa hồng",
      category: "referral",
      queryParams: ["period", "limit"],
    },
    {
      method: "GET",
      path: "/dashboard/referral/commissions/stats",
      description: "Thống kê hoa hồng",
      category: "referral",
      queryParams: ["period"],
    },
    // Commission policy
    {
      method: "GET",
      path: "/dashboard/admin/commission-policy/get",
      description: "Commission policy",
      category: "admin",
    },
  ],
  models: [
    {
      name: "Order",
      description: "Đơn hàng",
      category: "billing",
      fields: [
        { name: "orderCode", type: "string" },
        { name: "finalAmount", type: "number" },
        { name: "status", type: "enum" },
        { name: "currency", type: "string" },
      ],
    },
    {
      name: "OrderItem",
      description: "Chi tiết đơn",
      category: "billing",
      fields: [
        { name: "serviceId", type: "number" },
        { name: "basePrice", type: "number" },
        { name: "quantity", type: "number" },
        { name: "finalAmount", type: "number" },
      ],
    },
    {
      name: "Token",
      description: "API Key",
      category: "token",
      fields: [
        { name: "name", type: "string" },
        { name: "prefix", type: "string" },
      ],
    },
    {
      name: "Voucher",
      description: "Mã giảm giá",
      category: "admin",
      fields: [
        { name: "code", type: "string" },
        { name: "discountType", type: "enum" },
        { name: "value", type: "number" },
      ],
    },
    {
      name: "Service",
      description: "API service",
      category: "admin",
      fields: [
        { name: "name", type: "string" },
        { name: "endpoint", type: "string" },
        { name: "maxCalls", type: "number" },
      ],
    },
    {
      name: "ServiceUsage",
      description: "Lịch sử dùng service",
      category: "monitor",
      fields: [
        { name: "serviceId", type: "number" },
        { name: "timestamp", type: "datetime" },
        { name: "isError", type: "boolean" },
      ],
    },
  ],
  features: [
    {
      id: "create-order",
      name: "Tạo đơn hàng",
      description: "Tạo đơn hàng mới với items và voucher",
      category: "billing",
      endpoints: ["/dashboard/order/orders"],
      actions: ["create"],
    },
    {
      id: "list-orders",
      name: "Xem đơn hàng",
      description: "Danh sách đơn hàng có filter",
      category: "billing",
      endpoints: ["/dashboard/order/orders", "/dashboard/order/history"],
      actions: ["list", "filter"],
    },
    {
      id: "create-token",
      name: "Tạo API Key",
      description: "Tạo API key mới",
      category: "token",
      endpoints: ["/dashboard/token/create"],
      actions: ["create"],
    },
    {
      id: "view-overview",
      name: "Tổng quan",
      description: "Xem tổng quan tài khoản",
      category: "overview",
      endpoints: ["/dashboard/overview"],
      actions: ["view"],
    },
    {
      id: "view-logs",
      name: "Xem logs",
      description: "Xem logs API",
      category: "monitor",
      endpoints: ["/dashboard/monitor/logs"],
      actions: ["list", "filter"],
    },
    {
      id: "view-analytics",
      name: "Phân tích",
      description: "Phân tích sử dụng API",
      category: "monitor",
      endpoints: ["/dashboard/monitor/analytics"],
      actions: ["view", "chart"],
    },
    {
      id: "view-billing",
      name: "Lịch sử thanh toán",
      description: "Xem lịch sử đơn hàng",
      category: "billing",
      endpoints: ["/dashboard/order/history"],
      actions: ["list"],
    },
    {
      id: "stats-revenue",
      name: "Thống kê doanh thu",
      description: "Thống kê doanh thu",
      category: "stats",
      endpoints: ["/dashboard/admin/finance-stats", "/dashboard/admin/default-stats"],
      actions: ["stats", "chart"],
    },
    {
      id: "referral",
      name: "Giới thiệu",
      description: "Link và hoa hồng",
      category: "referral",
      endpoints: ["/dashboard/referral/link", "/dashboard/referral/commissions"],
      actions: ["view", "stats"],
    },
  ],
};

export function getContextForAI(): string {
  return `## API Endpoints\n${codebaseContext.apiEndpoints.map((e) => `- ${e.method} ${e.path}: ${e.description}`).join("\n")}\n\n## Models\n${codebaseContext.models.map((m) => `- ${m.name}: ${m.description} [${m.fields.map((f) => f.name).join(", ")}]`).join("\n")}\n\n## Features\n${codebaseContext.features.map((f) => `- ${f.name} (${f.id}): ${f.description}`).join("\n")}`;
}
