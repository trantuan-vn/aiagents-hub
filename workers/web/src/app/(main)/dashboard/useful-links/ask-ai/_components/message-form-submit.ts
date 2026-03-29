export interface MessageFormPayload {
  endpoint?: string;
  method?: string;
  displayMode?: "inline" | "modal";
  formTitle?: string;
  schema?: {
    fields?: Array<{ name: string; type: string; label?: string; required?: boolean }>;
  };
}

type ApiJson = Record<string, unknown> & { error?: string; message?: string };

async function readJson(res: Response): Promise<ApiJson> {
  return (await res.json().catch(() => ({}))) as ApiJson;
}

function assertOk(res: Response, data: ApiJson): void {
  if (!res.ok) throw new Error(data.error ?? data.message ?? "Request failed");
}

function buildUrl(endpoint: string, apiBase: string): string {
  return endpoint.startsWith("http") ? endpoint : `${apiBase}${endpoint}`;
}

export type SubmitMessageFormResult = {
  data: Record<string, unknown>;
  successMessage: string;
};

export async function submitMessageForm(
  payload: MessageFormPayload,
  values: Record<string, unknown>,
  apiBase: string,
): Promise<SubmitMessageFormResult> {
  const endpoint = payload.endpoint ?? "";
  const method = (payload.method ?? "POST") as string;
  const isLogs = endpoint.includes("/dashboard/monitor/logs");

  if (method === "POST" && endpoint.includes("/dashboard/order/orders")) {
    return submitOrder(endpoint, values, apiBase);
  }
  if (method === "DELETE" && endpoint.includes("/dashboard/token/revoke") && !endpoint.match(/revoke\/\d/)) {
    return submitTokenRevoke(endpoint, values, apiBase);
  }
  if (payload.method === "GET") {
    return submitGet(endpoint, values, apiBase, isLogs);
  }
  return submitGenericJson(endpoint, payload.method ?? "POST", values, apiBase);
}

async function submitOrder(
  endpoint: string,
  values: Record<string, unknown>,
  apiBase: string,
): Promise<SubmitMessageFormResult> {
  const url = buildUrl(endpoint, apiBase);
  const body = {
    items: [
      {
        serviceId: Number(values.serviceId),
        basePrice: Number(values.basePrice),
        quantity: Number(values.quantity),
      },
    ],
    currency: (values.currency as string) || "VND",
    voucherCode: values.voucherCode ? String(values.voucherCode) : undefined,
    notes: values.notes ? String(values.notes) : undefined,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await readJson(res);
  assertOk(res, data);
  return {
    data,
    successMessage: "Đã tạo đơn hàng. Bạn có thể xem chi tiết trong mục Đơn hàng.",
  };
}

async function submitTokenRevoke(
  endpoint: string,
  values: Record<string, unknown>,
  apiBase: string,
): Promise<SubmitMessageFormResult> {
  const tid = Number(values.tokenId);
  if (!Number.isFinite(tid) || tid < 1) throw new Error("tokenId không hợp lệ");
  const trimmed = endpoint.replace(/\/$/, "");
  const base = endpoint.startsWith("http") ? trimmed : `${apiBase}${trimmed}`;
  const url = `${base}/${tid}`;
  const res = await fetch(url, { method: "DELETE", credentials: "include" });
  const data = await readJson(res);
  assertOk(res, data);
  return { data, successMessage: "Đã thu hồi API key." };
}

function applyLogDateTimestamps(finalValues: Record<string, unknown>): void {
  const toTimestamp = (key: string) => {
    const v = finalValues[key];
    if (v && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d =
        key === "dateTo"
          ? (() => {
              const x = new Date(v);
              x.setHours(23, 59, 59, 999);
              return x;
            })()
          : new Date(v);
      finalValues[key] = String(d.getTime());
    }
  };
  toTimestamp("dateFrom");
  toTimestamp("dateTo");
}

async function submitGet(
  endpoint: string,
  values: Record<string, unknown>,
  apiBase: string,
  isLogs: boolean,
): Promise<SubmitMessageFormResult> {
  const finalValues = { ...values };
  if (isLogs) applyLogDateTimestamps(finalValues);
  const params = new URLSearchParams(
    Object.entries(finalValues).reduce(
      (acc, [k, v]) => {
        if (v != null && v !== "") acc[k] = String(v);
        return acc;
      },
      {} as Record<string, string>,
    ),
  );
  const url = `${apiBase}${endpoint}${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  const data = await readJson(res);
  assertOk(res, data);
  return { data, successMessage: "Thao tác thành công." };
}

async function submitGenericJson(
  endpoint: string,
  method: string,
  values: Record<string, unknown>,
  apiBase: string,
): Promise<SubmitMessageFormResult> {
  const url = buildUrl(endpoint, apiBase);
  const res = await fetch(url, {
    method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(values),
  });
  const data = await readJson(res);
  assertOk(res, data);
  return { data, successMessage: "Thao tác thành công." };
}
