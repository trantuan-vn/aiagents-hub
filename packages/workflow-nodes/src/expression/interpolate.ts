import { evaluateExpression } from "./evaluate";

export type ExpressionScope = Record<string, unknown>;

type TemplateBlock = {
  start: number;
  end: number;
  expr: string;
};

function findTemplateBlocks(template: string): TemplateBlock[] {
  const blocks: TemplateBlock[] = [];
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "{" || template[i + 1] !== "{") {
      i += 1;
      continue;
    }
    const start = i;
    i += 2;
    let quote: string | null = null;
    let found = false;
    while (i < template.length) {
      const ch = template[i];
      if (quote) {
        if (ch === "\\" && quote !== null) {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === "}" && template[i + 1] === "}") {
        blocks.push({ start, end: i + 2, expr: template.slice(start + 2, i) });
        i += 2;
        found = true;
        break;
      }
      i += 1;
    }
    if (!found) break;
  }
  return blocks;
}

function isSingleExpression(template: string, blocks: TemplateBlock[]): boolean {
  if (blocks.length !== 1) return false;
  return template.slice(0, blocks[0].start).trim() === "" && template.slice(blocks[0].end).trim() === "";
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Resolve `{{ expr }}` against a scope. A lone expression returns the raw value. */
export function interpolate(template: string, scope: ExpressionScope): unknown {
  if (!template.includes("{{")) return template;
  const blocks = findTemplateBlocks(template);
  if (!blocks.length) return template;

  if (isSingleExpression(template, blocks)) {
    return evaluateExpression(blocks[0].expr, scope);
  }

  let out = "";
  let cursor = 0;
  for (const block of blocks) {
    out += template.slice(cursor, block.start);
    out += stringifyValue(evaluateExpression(block.expr, scope));
    cursor = block.end;
  }
  return out + template.slice(cursor);
}

export function interpolateDeep(value: unknown, scope: ExpressionScope): unknown {
  if (typeof value === "string") return interpolate(value, scope);
  if (Array.isArray(value)) return value.map((entry) => interpolateDeep(entry, scope));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = interpolateDeep(entry, scope);
    }
    return out;
  }
  return value;
}
