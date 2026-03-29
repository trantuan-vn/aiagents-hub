# Ví dụ code — giống phong cách tài liệu dashboard

Dùng `fetch` với `credentials: 'include'` (session cookie). Thay `API_BASE` bằng URL API thực tế (ví dụ `https://api.unitoken.trade`).

## Tạo API key

```ts
const API_BASE = 'https://api.unitoken.trade';

async function createApiKey(name: string) {
  const res = await fetch(`${API_BASE}/dashboard/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name,
      permissions: [],
      expiresInDays: 365,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'create failed');
  }
  return res.json() as Promise<{ rawToken?: string; warning?: string }>;
}
```

## Liệt kê API keys

```ts
async function listApiKeys() {
  const res = await fetch(`${API_BASE}/dashboard/token/list`, { credentials: 'include' });
  if (!res.ok) throw new Error('list failed');
  return res.json();
}
```

## Thu hồi một API key

```ts
async function revokeApiKey(tokenId: number) {
  const res = await fetch(`${API_BASE}/dashboard/token/revoke/${tokenId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('revoke failed');
  return res.json();
}
```

## Tạo đơn hàng

```ts
type OrderItem = { serviceId: number; basePrice: number; quantity: number };

async function createOrder(items: OrderItem[], opts?: { currency?: string; voucherCode?: string; notes?: string }) {
  const res = await fetch(`${API_BASE}/dashboard/order/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      items,
      currency: opts?.currency ?? 'VND',
      voucherCode: opts?.voucherCode,
      notes: opts?.notes,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'order failed');
  }
  return res.json();
}

// Ví dụ gọi
await createOrder([{ serviceId: 1, basePrice: 10000, quantity: 2 }], { notes: 'Đơn test' });
```

## Lịch sử đơn (theo ngày)

```ts
async function orderHistory(fromDate: string, toDate: string) {
  const q = new URLSearchParams({ fromDate, toDate, limit: '50' });
  const res = await fetch(`${API_BASE}/dashboard/order/history?${q}`, { credentials: 'include' });
  if (!res.ok) throw new Error('history failed');
  return res.json();
}
```

## curl (API key / cookie)

Với session cookie đã export hoặc tool tương tự:

```bash
curl -X POST "$API_BASE/dashboard/token/create" \
  -H "Content-Type: application/json" \
  -b "session=..." \
  -d '{"name":"My integration key","permissions":[],"expiresInDays":90}'
```

Khi thiếu tham số bắt buộc, luôn thu thập qua form (UI) rồi gọi lại API sau khi user điền đủ.
