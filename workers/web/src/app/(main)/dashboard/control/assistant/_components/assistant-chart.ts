const PALETTE = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#8B5CF6"];
const CHART_TYPES = new Set(["bar", "line", "pie", "doughnut", "radar", "polarArea"]);

type ChartSeries = { label: string; data: number[] };

type AssistantChart = {
  type: string;
  title: string;
  labels: string[];
  datasets: ChartSeries[];
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

function shortLabel(value: string): string {
  const text = value.trim();
  return text.length > 16 ? `${text.slice(0, 15)}…` : text;
}

function asNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function parseAssistantChart(raw: string | null): AssistantChart | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || !CHART_TYPES.has(record.type)) return null;
  const data = record.data;
  if (!data || typeof data !== "object") return null;
  const dataRecord = data as Record<string, unknown>;
  const rawLabels = Array.isArray(dataRecord.labels) ? dataRecord.labels.slice(0, 30).map((item) => String(item ?? "")) : [];
  const datasets = Array.isArray(dataRecord.datasets)
    ? dataRecord.datasets.slice(0, 6).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const series = item as Record<string, unknown>;
        const points = Array.isArray(series.data) ? series.data.slice(0, 30).map(asNumber) : [];
        if (!points.length) return [];
        return [{ label: typeof series.label === "string" ? series.label : "", data: points }];
      })
    : [];
  if (!datasets.length) return null;
  const count = Math.min(30, Math.max(rawLabels.length, ...datasets.map((series) => series.data.length)));
  if (!count) return null;
  const labels = Array.from({ length: count }, (_, index) => rawLabels[index] || String(index + 1));
  const options = record.options && typeof record.options === "object" ? (record.options as Record<string, unknown>) : {};
  const plugins = options.plugins && typeof options.plugins === "object" ? (options.plugins as Record<string, unknown>) : {};
  const titleOption = plugins.title && typeof plugins.title === "object" ? (plugins.title as Record<string, unknown>) : {};
  const title = titleOption.display === false ? "" : typeof titleOption.text === "string" ? titleOption.text : "";
  return {
    type: record.type,
    title,
    labels,
    datasets: datasets.map((series) => ({
      label: series.label,
      data: Array.from({ length: count }, (_, index) => series.data[index] ?? 0),
    })),
  };
}

function extent(values: number[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) max = min + 1;
  return { min, max };
}

function titleText(chart: AssistantChart): string {
  return chart.title
    ? `<text x="320" y="22" text-anchor="middle" fill="currentColor" font-size="14">${esc(chart.title)}</text>`
    : "";
}

function legend(chart: AssistantChart, y: number): string {
  if (chart.datasets.length < 2 && chart.type !== "pie" && chart.type !== "doughnut" && chart.type !== "polarArea") {
    return "";
  }
  const items = chart.type === "pie" || chart.type === "doughnut" || chart.type === "polarArea"
    ? chart.labels.map((label, index) => ({ label, color: PALETTE[index % PALETTE.length] }))
    : chart.datasets.map((series, index) => ({ label: series.label || `Series ${index + 1}`, color: PALETTE[index % PALETTE.length] }));
  return items
    .slice(0, 8)
    .map((item, index) => {
      const x = 48 + (index % 4) * 145;
      const row = y + Math.floor(index / 4) * 16;
      return `<rect x="${x}" y="${row - 9}" width="10" height="10" rx="2" fill="${item.color}" /><text x="${x + 14}" y="${row}" fill="currentColor" font-size="11">${esc(shortLabel(item.label))}</text>`;
    })
    .join("");
}

function barBody(chart: AssistantChart): string {
  const { min, max } = extent(chart.datasets.flatMap((series) => series.data));
  const left = 52;
  const right = 620;
  const top = chart.title ? 44 : 24;
  const bottom = 286;
  const plotW = right - left;
  const plotH = bottom - top;
  const yOf = (value: number) => top + ((max - value) / (max - min)) * plotH;
  const zeroY = yOf(Math.min(Math.max(0, min), max));
  const parts = [titleText(chart)];
  for (let step = 0; step <= 4; step += 1) {
    const value = min + ((max - min) * step) / 4;
    const y = yOf(value);
    parts.push(`<line x1="${left}" y1="${y.toFixed(1)}" x2="${right}" y2="${y.toFixed(1)}" stroke="#E5E7EB" />`);
    parts.push(`<text x="${left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="currentColor" font-size="11">${formatNum(value)}</text>`);
  }
  const groupW = plotW / chart.labels.length;
  const barW = Math.max(4, Math.min(26, (groupW * 0.72) / chart.datasets.length));
  chart.labels.forEach((label, index) => {
    const groupX = left + index * groupW;
    chart.datasets.forEach((series, seriesIndex) => {
      const value = series.data[index] ?? 0;
      const y = Math.min(yOf(value), zeroY);
      const height = Math.max(Math.abs(yOf(value) - zeroY), 0);
      const x = groupX + (groupW - barW * chart.datasets.length) / 2 + seriesIndex * barW;
      const name = series.label || label;
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${height.toFixed(1)}" fill="${PALETTE[seriesIndex % PALETTE.length]}" rx="2"><title>${esc(name)}: ${formatNum(value)}</title></rect>`,
      );
    });
    parts.push(
      `<text x="${(groupX + groupW / 2).toFixed(1)}" y="${bottom + 18}" text-anchor="middle" fill="currentColor" font-size="11">${esc(shortLabel(label))}</text>`,
    );
  });
  parts.push(legend(chart, 338));
  return parts.join("");
}

function lineBody(chart: AssistantChart): string {
  const { min, max } = extent(chart.datasets.flatMap((series) => series.data));
  const left = 52;
  const right = 620;
  const top = chart.title ? 44 : 24;
  const bottom = 286;
  const plotW = right - left;
  const plotH = bottom - top;
  const yOf = (value: number) => top + ((max - value) / (max - min)) * plotH;
  const xOf = (index: number) => left + (chart.labels.length <= 1 ? plotW / 2 : (index / (chart.labels.length - 1)) * plotW);
  const parts = [titleText(chart)];
  for (let step = 0; step <= 4; step += 1) {
    const value = min + ((max - min) * step) / 4;
    const y = yOf(value);
    parts.push(`<line x1="${left}" y1="${y.toFixed(1)}" x2="${right}" y2="${y.toFixed(1)}" stroke="#E5E7EB" />`);
    parts.push(`<text x="${left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="currentColor" font-size="11">${formatNum(value)}</text>`);
  }
  chart.datasets.forEach((series, seriesIndex) => {
    const color = PALETTE[seriesIndex % PALETTE.length];
    const points = chart.labels.map((_, index) => `${xOf(index).toFixed(1)},${yOf(series.data[index] ?? 0).toFixed(1)}`).join(" ");
    parts.push(`<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${points}" />`);
    chart.labels.forEach((_, index) => {
      const value = series.data[index] ?? 0;
      parts.push(`<circle cx="${xOf(index).toFixed(1)}" cy="${yOf(value).toFixed(1)}" r="3.5" fill="${color}"><title>${esc(series.label || chart.labels[index] || "")}: ${formatNum(value)}</title></circle>`);
    });
  });
  chart.labels.forEach((label, index) => {
    parts.push(`<text x="${xOf(index).toFixed(1)}" y="${bottom + 18}" text-anchor="middle" fill="currentColor" font-size="11">${esc(shortLabel(label))}</text>`);
  });
  parts.push(legend(chart, 338));
  return parts.join("");
}

function polarPoint(cx: number, cy: number, radius: number, angle: number): string {
  return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
}

function slicePath(cx: number, cy: number, radius: number, inner: number, start: number, end: number, fill: string, label: string): string {
  const span = end - start;
  if (span <= 0) return "";
  const title = `<title>${esc(label)}</title>`;
  if (span >= Math.PI * 2 - 0.001) {
    if (inner > 0) {
      return `<path fill="${fill}" d="M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} L ${cx} ${cy - inner} A ${inner} ${inner} 0 1 0 ${cx - 0.01} ${cy - inner} Z">${title}</path>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}">${title}</circle>`;
  }
  const large = span > Math.PI ? 1 : 0;
  if (inner <= 0) {
    return `<path fill="${fill}" d="M ${cx} ${cy} L ${polarPoint(cx, cy, radius, start)} A ${radius} ${radius} 0 ${large} 1 ${polarPoint(cx, cy, radius, end)} Z">${title}</path>`;
  }
  return `<path fill="${fill}" d="M ${polarPoint(cx, cy, radius, start)} A ${radius} ${radius} 0 ${large} 1 ${polarPoint(cx, cy, radius, end)} L ${polarPoint(cx, cy, inner, end)} A ${inner} ${inner} 0 ${large} 0 ${polarPoint(cx, cy, inner, start)} Z">${title}</path>`;
}

function pieBody(chart: AssistantChart): string {
  const series = chart.datasets[0];
  const values = chart.labels.map((_, index) => Math.max(series?.data[index] ?? 0, 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return titleText(chart);
  const peak = Math.max(...values, 1);
  const cx = 200;
  const cy = 176;
  const radius = 108;
  const inner = chart.type === "doughnut" ? 58 : 0;
  let angle = -Math.PI / 2;
  const parts = [titleText(chart)];
  values.forEach((value, index) => {
    const next = angle + (value / total) * Math.PI * 2;
    const sliceRadius = chart.type === "polarArea" ? Math.max(12, (radius * value) / peak) : radius;
    parts.push(slicePath(cx, cy, sliceRadius, inner, angle, next, PALETTE[index % PALETTE.length] ?? PALETTE[0], `${chart.labels[index]}: ${formatNum(value)}`));
    angle = next;
  });
  chart.labels.slice(0, 10).forEach((label, index) => {
    const y = 78 + index * 18;
    const color = PALETTE[index % PALETTE.length];
    parts.push(`<rect x="360" y="${y - 10}" width="10" height="10" rx="2" fill="${color}" />`);
    parts.push(`<text x="376" y="${y}" fill="currentColor" font-size="12">${esc(shortLabel(label))} ${formatNum(values[index] ?? 0)}</text>`);
  });
  return parts.join("");
}

function radarBody(chart: AssistantChart): string {
  const cx = 250;
  const cy = 176;
  const radius = 110;
  const count = chart.labels.length;
  const max = Math.max(1, ...chart.datasets.flatMap((series) => series.data.map((value) => Math.max(value, 0))));
  const at = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const length = (radius * Math.max(value, 0)) / max;
    return polarPoint(cx, cy, length, angle);
  };
  const parts = [titleText(chart)];
  for (let ring = 1; ring <= 4; ring += 1) {
    const points = chart.labels.map((_, index) => at(index, (max * ring) / 4)).join(" ");
    parts.push(`<polygon points="${points}" fill="none" stroke="#E5E7EB" />`);
  }
  chart.labels.forEach((label, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const x = cx + (radius + 16) * Math.cos(angle);
    const y = cy + (radius + 16) * Math.sin(angle);
    parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" fill="currentColor" font-size="11">${esc(shortLabel(label))}</text>`);
  });
  chart.datasets.forEach((series, seriesIndex) => {
    const color = PALETTE[seriesIndex % PALETTE.length];
    const points = chart.labels.map((_, index) => at(index, series.data[index] ?? 0)).join(" ");
    parts.push(`<polygon points="${points}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"><title>${esc(series.label || "series")}</title></polygon>`);
  });
  parts.push(legend(chart, 338));
  return parts.join("");
}

/** Turn a chart config into a labeled graphic. Returns null when there is nothing to draw. */
export function chartToSvg(raw: string | null): string | null {
  const chart = parseAssistantChart(raw);
  if (!chart) return null;
  const aria = esc(chart.title || chart.datasets.map((series) => series.label).filter(Boolean).join(", ") || "chart");
  let body = "";
  if (chart.type === "line") body = lineBody(chart);
  else if (chart.type === "pie" || chart.type === "doughnut" || chart.type === "polarArea") body = pieBody(chart);
  else if (chart.type === "radar") body = radarBody(chart);
  else body = barBody(chart);
  if (!body.trim()) return null;
  return `<svg viewBox="0 0 640 360" width="100%" role="img" aria-label="${aria}"><title>${aria}</title>${body}</svg>`;
}
