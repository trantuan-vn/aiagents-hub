export function formatGatewayTime(input: string | number | null | undefined): string {
  if (input == null || input === "") return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} GMT+7`;
}

export function formatCostUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value)
    .toFixed(8)
    .replace(/\.?0+$/, "");
  return `${sign}$${abs}`;
}

export function providerLabel(provider: string): string {
  if (provider === "workers-ai") return "Workers AI";
  return provider || "—";
}

export function hasLongNumberArray(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.length > 32 && value.every((item) => typeof item === "number")) return true;
    return value.some((item) => hasLongNumberArray(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => hasLongNumberArray(item));
  }
  return false;
}

export function presentJson(value: unknown, showFull: boolean): string {
  const printed = JSON.stringify(
    value,
    (_key, current) => {
      if (
        !showFull &&
        Array.isArray(current) &&
        current.length > 32 &&
        current.every((item) => typeof item === "number")
      ) {
        return [...current.slice(0, 8), `… ${current.length} values`];
      }
      return current;
    },
    2,
  );
  return printed ?? "null";
}

export function filterJsonTree(value: unknown, query: string): unknown {
  const needle = query.trim().toLowerCase();
  if (!needle) return value;
  if (value == null) return String(value).includes(needle) ? value : undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().includes(needle) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const next = value
      .map((item) => filterJsonTree(item, needle))
      .filter((item) => item !== undefined);
    return next.length ? next : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key.toLowerCase().includes(needle)) {
        out[key] = child;
        continue;
      }
      const filtered = filterJsonTree(child, needle);
      if (filtered !== undefined) out[key] = filtered;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}
