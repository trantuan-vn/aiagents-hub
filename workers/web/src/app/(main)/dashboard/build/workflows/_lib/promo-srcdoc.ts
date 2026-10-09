import { bytesToBase64, type PromoFolderFile } from "./promo-folder";

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function dataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

function lookup(files: Map<string, PromoFolderFile>, fromDir: string, ref: string): PromoFolderFile | null {
  const raw = ref.split("#")[0]?.split("?")[0]?.trim() ?? "";
  if (!raw || /^(https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(raw)) return null;
  const parts = `${fromDir}${raw}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return files.get(stack.join("/").toLowerCase()) ?? null;
}

function dirOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index + 1);
}

function rewriteCss(css: string, dir: string, files: Map<string, PromoFolderFile>, depth: number): string {
  if (depth > 4) return css;
  const imported = css.replace(/@import\s+(['"])([^'"]+)\1/g, (full, quote: string, ref: string) => {
    const asset = lookup(files, dir, ref);
    if (!asset || !asset.contentType.includes("css")) return full;
    const nested = rewriteCss(decodeText(asset.bytes), dirOf(asset.path), files, depth + 1);
    return `@import ${quote}${dataUrl(new TextEncoder().encode(nested), "text/css")}${quote}`;
  });
  return imported.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, quote: string, ref: string) => {
    const asset = lookup(files, dir, ref);
    if (!asset || asset.contentType.includes("css") || asset.contentType.includes("html")) return full;
    return `url(${quote}${dataUrl(asset.bytes, asset.contentType)}${quote})`;
  });
}

function rewriteSrcset(value: string, dir: string, files: Map<string, PromoFolderFile>): string {
  return value
    .split(",")
    .map((part) => {
      const bits = part.trim().split(/\s+/);
      const asset = lookup(files, dir, bits[0] ?? "");
      if (!asset) return part;
      bits[0] = dataUrl(asset.bytes, asset.contentType);
      return bits.join(" ");
    })
    .join(", ");
}

/** Build a sandboxed document so the showcase cannot touch the dashboard origin. */
export function buildPromoSrcDoc(input: PromoFolderFile[]): string | null {
  const files = new Map(input.map((file) => [file.path.toLowerCase(), file]));
  const index = input.find((file) => /^index\.html?$/i.test(file.path));
  if (!index || typeof DOMParser === "undefined") return null;

  const doc = new DOMParser().parseFromString(decodeText(index.bytes), "text/html");
  const baseDir = dirOf(index.path);

  for (const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'))) {
    const asset = lookup(files, baseDir, link.getAttribute("href") ?? "");
    if (!asset) continue;
    const style = doc.createElement("style");
    style.textContent = rewriteCss(decodeText(asset.bytes), dirOf(asset.path), files, 0).replace(/<\/style/gi, "<\\/style");
    link.replaceWith(style);
  }

  for (const style of Array.from(doc.querySelectorAll("style"))) {
    style.textContent = rewriteCss(style.textContent ?? "", baseDir, files, 0).replace(/<\/style/gi, "<\\/style");
  }

  for (const script of Array.from(doc.querySelectorAll("script[src]"))) {
    const src = script.getAttribute("src") ?? "";
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    const asset = lookup(files, baseDir, src);
    script.removeAttribute("src");
    if (!asset) continue;
    script.textContent = decodeText(asset.bytes).replace(/<\/script/gi, "<\\/script");
  }

  for (const el of Array.from(doc.querySelectorAll("[src]"))) {
    const src = el.getAttribute("src") ?? "";
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    const asset = lookup(files, baseDir, src);
    if (!asset || asset.contentType.includes("html")) {
      el.removeAttribute("src");
      continue;
    }
    el.setAttribute("src", dataUrl(asset.bytes, asset.contentType));
  }

  for (const el of Array.from(doc.querySelectorAll("[srcset]"))) {
    el.setAttribute("srcset", rewriteSrcset(el.getAttribute("srcset") ?? "", baseDir, files));
  }

  for (const el of Array.from(doc.querySelectorAll("[style]"))) {
    const value = el.getAttribute("style") ?? "";
    el.setAttribute("style", rewriteCss(value, baseDir, files, 0));
  }

  for (const anchor of Array.from(doc.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    if (/^(https?:|mailto:|#)/i.test(href)) continue;
    const asset = lookup(files, baseDir, href);
    if (asset?.contentType.includes("html")) anchor.setAttribute("href", "#");
  }

  for (const form of Array.from(doc.querySelectorAll("form"))) {
    const action = form.getAttribute("action") ?? "";
    if (!/^https?:/i.test(action)) form.setAttribute("action", "#");
  }

  const base = doc.createElement("base");
  base.setAttribute("target", "_blank");
  const referrer = doc.createElement("meta");
  referrer.setAttribute("name", "referrer");
  referrer.setAttribute("content", "no-referrer");
  doc.head.insertBefore(base, doc.head.firstChild);
  doc.head.insertBefore(referrer, doc.head.firstChild);

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}
