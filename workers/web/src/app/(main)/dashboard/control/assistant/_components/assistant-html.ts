import { chartToSvg } from "./assistant-chart";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "g", "rect", "circle", "ellipse", "path", "line", "polyline", "polygon", "text", "tspan", "title"]);
const DROP_TAGS = new Set(["script", "style", "iframe", "object", "embed", "foreignobject", "image", "use", "animate", "set"]);
const STYLE_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "padding",
  "border-radius",
  "font-size",
  "text-align",
  "display",
  "gap",
  "max-width",
  "margin",
  "width",
  "height",
  "font-weight",
  "border",
  "border-color",
  "flex-direction",
  "align-items",
  "justify-content",
  "line-height",
]);
const SVG_ATTRS = new Set([
  "viewbox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-opacity",
  "transform",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "role",
  "aria-label",
]);

export function unwrapAssistantHtml(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function looksLikeAssistantHtml(text: string): boolean {
  return /<\/?(?:p|ul|ol|li|table|h[1-4]|div|blockquote|strong|em|a|br|svg|canvas|pre)\b/i.test(text);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let value = escapeHtml(text.trim());
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  value = value.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/(?!\/))[^)\s]+)\)/g, '<a href="$2">$1</a>');
  value = value.replace(/(^|[\s(])(https?:\/\/[^\s<]+)(?=$|[\s).,])/g, '$1<a href="$2">$2</a>');
  return value;
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(line);
}

function isHeading(line: string): boolean {
  return /^#{1,4}\s+\S/.test(line.trim());
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.split("|").filter((cell) => cell.trim()).length >= 2;
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isFieldLine(line: string): boolean {
  return /^[^:\n]{1,32}:\s+\S/.test(line.trim()) && !/^https?:/i.test(line.trim());
}

function isSpecial(line: string): boolean {
  return isListLine(line) || isHeading(line) || isTableRow(line) || isFieldLine(line);
}

function tableHtml(rows: string[]): string {
  const body = rows
    .filter((row) => !isSeparatorRow(row))
    .map((row, index) => {
      const cells = row
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      const tag = index === 0 ? "th" : "td";
      return `<tr>${cells.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join("")}</tr>`;
    })
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}

/** Turn plain text or markdown into an HTML fragment. Real HTML is left for the sanitizer. */
export function assistantMarkup(text: string): string {
  const source = unwrapAssistantHtml(text);
  if (!source) return "";
  if (looksLikeAssistantHtml(source)) return source;

  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (isHeading(line)) {
      const trimmed = line.trim();
      const level = trimmed.match(/^#+/)?.[0].length ?? 2;
      const tag = level <= 2 ? "h2" : "h3";
      blocks.push(`<${tag}>${inline(trimmed.replace(/^#{1,4}\s+/, ""))}</${tag}>`);
      index += 1;
      continue;
    }
    if (isTableRow(line) && index + 1 < lines.length && isSeparatorRow(lines[index + 1] ?? "")) {
      const rows = [line];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(tableHtml(rows));
      continue;
    }
    if (isListLine(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && isListLine(lines[index] ?? "")) {
        items.push(`<li>${inline((lines[index] ?? "").replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (isFieldLine(line) && isFieldLine(lines[index + 1] ?? "")) {
      const rows: string[] = [];
      while (index < lines.length && isFieldLine(lines[index] ?? "")) {
        const match = (lines[index] ?? "").trim().match(/^([^:]{1,32}):\s*(.+)$/);
        if (match?.[1] && match[2]) {
          rows.push(`<tr><th>${inline(match[1])}</th><td>${inline(match[2])}</td></tr>`);
        }
        index += 1;
      }
      if (rows.length) blocks.push(`<table><tbody>${rows.join("")}</tbody></table>`);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !isSpecial(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(`<p>${paragraph.map((part) => inline(part)).join("<br>")}</p>`);
  }
  return blocks.join("");
}

function safeHref(value: string | null): string | null {
  const href = value?.trim() ?? "";
  if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) return href;
  if (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") && !/[\s<>"']/.test(href)) return href;
  return null;
}

function safeStyle(raw: string | null): string | null {
  if (!raw) return null;
  const kept: string[] = [];
  for (const part of raw.split(";")) {
    const splitAt = part.indexOf(":");
    if (splitAt < 0) continue;
    const prop = part.slice(0, splitAt).trim().toLowerCase();
    const value = part.slice(splitAt + 1).trim();
    if (!STYLE_PROPS.has(prop) || !value || value.length > 80) continue;
    if (/url\s*\(|expression|javascript:|@import/i.test(value)) continue;
    kept.push(`${prop}:${value}`);
  }
  return kept.length ? kept.join(";") : null;
}

function safePaint(value: string): string | null {
  const paint = value.trim();
  if (!paint || paint.length > 80) return null;
  if (/url\s*\(|script|expression|javascript:/i.test(paint)) return null;
  if (/^(none|currentcolor|transparent|#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i.test(paint)) return paint;
  return null;
}

function copySvgAttrs(el: Element, out: Element) {
  for (const attr of el.attributes) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "href" || name.includes("href")) continue;
    if (name === "style") {
      const style = safeStyle(attr.value);
      if (style) out.setAttribute("style", style);
      continue;
    }
    if (!SVG_ATTRS.has(name)) continue;
    if ((name === "fill" || name === "stroke") && !safePaint(attr.value)) continue;
    if ((name === "d" || name === "points" || name === "transform") && (/url\s*\(|javascript:/i.test(attr.value) || attr.value.length > 8000)) {
      continue;
    }
    out.setAttribute(name === "viewbox" ? "viewBox" : name, attr.value.slice(0, 2000));
  }
}

function chartNode(doc: Document, raw: string | null): Element | null {
  const svg = chartToSvg(raw);
  if (!svg) return null;
  const wrap = doc.createElement("div");
  wrap.innerHTML = svg;
  return wrap.firstElementChild;
}

/** Keep layout, graphics, and diagram source. Drop scripts, event handlers, and external loads. */
export function sanitizeAssistantHtml(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (node: Node, inSvg: boolean): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) return null;
    if (tag === "canvas" && !inSvg) return chartNode(doc, el.getAttribute("data-chart"));
    if (tag === "pre" && !inSvg && el.classList.contains("mermaid")) {
      const out = doc.createElement("pre");
      out.setAttribute("class", "mermaid");
      out.textContent = (el.textContent ?? "").slice(0, 8000);
      return out;
    }
    const svgTag = tag === "svg" || (inSvg && SVG_TAGS.has(tag));
    if (!svgTag && !ALLOWED_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      for (const child of el.childNodes) {
        const next = clean(child, inSvg);
        if (next) fragment.appendChild(next);
      }
      return fragment;
    }
    const out = svgTag ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    if (svgTag) copySvgAttrs(el, out);
    else {
      const style = safeStyle(el.getAttribute("style"));
      if (style) out.setAttribute("style", style);
      if (tag === "a") {
        const href = safeHref(el.getAttribute("href"));
        if (href) {
          out.setAttribute("href", href);
          out.setAttribute("target", "_blank");
          out.setAttribute("rel", "noopener noreferrer");
        }
      }
    }
    for (const child of el.childNodes) {
      const next = clean(child, svgTag);
      if (next) out.appendChild(next);
    }
    return out;
  };
  const holder = doc.createElement("div");
  for (const child of doc.body.childNodes) {
    const next = clean(child, false);
    if (next) holder.appendChild(next);
  }
  return holder.innerHTML;
}

function visibleText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Incomplete markup must not hide the words that were already generated. */
function htmlToPlain(value: string): string {
  return value
    .replace(/<[^>]*$/, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-4]|li|tr|table|ul|ol|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function tagsLookComplete(html: string): boolean {
  if (/<[^>]*$/.test(html.trim())) return false;
  const open: string[] = [];
  const re = /<\/?([a-zA-Z][\w:-]*)[^>]*?>/g;
  const voidTags = new Set(["br", "hr"]);
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[0];
    const name = match[1]?.toLowerCase() ?? "";
    if (raw.startsWith("</")) {
      const at = open.lastIndexOf(name);
      if (at >= 0) open.splice(at, 1);
      continue;
    }
    if (!raw.endsWith("/>") && !voidTags.has(name)) open.push(name);
  }
  return open.length === 0;
}

export function formatAssistantReply(text: string): string {
  const markup = assistantMarkup(text);
  const html = sanitizeAssistantHtml(markup);
  const hasVisual = /<(?:svg|canvas)\b|class=["']mermaid["']/i.test(markup);
  if (hasVisual && html) return html;
  const complete = !looksLikeAssistantHtml(markup) || tagsLookComplete(markup);
  const rendered = complete ? html : "";
  const source = visibleText(text);
  const shown = visibleText(rendered);
  if (rendered && source && shown.length >= source.length * 0.98) return rendered;
  const plain = assistantMarkup(htmlToPlain(text));
  return sanitizeAssistantHtml(plain) || plain;
}
