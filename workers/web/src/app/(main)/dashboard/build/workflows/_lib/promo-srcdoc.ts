import { bytesToBase64, type PromoFolderFile } from "./promo-folder";

/** Fake origin so relative and hash links cannot resolve onto the dashboard URL. */
const PROMO_BASE_ORIGIN = "https://promo.invalid";

export const PROMO_FRAME_MESSAGE = "aiagents-promo";

export function findPromoIndex(files: PromoFolderFile[]): PromoFolderFile | null {
  return files.find((file) => /^index\.html?$/i.test(file.path)) ?? null;
}

/** Map a clicked href onto an HTML file in the uploaded folder. */
export function resolvePromoPage(files: PromoFolderFile[], rawPath: string): string | null {
  const index = findPromoIndex(files);
  const cleaned =
    rawPath
      .replace(/\\/g, "/")
      .split("#")[0]
      ?.split("?")[0]
      ?.replace(/^\/+/, "")
      .replace(/\/+$/, "") ?? "";
  const candidates = cleaned
    ? [cleaned, `${cleaned}.html`, `${cleaned}.htm`, `${cleaned}/index.html`, `${cleaned}/index.htm`]
    : index
      ? [index.path]
      : [];
  const byPath = new Map(files.map((file) => [file.path.toLowerCase(), file.path]));
  for (const candidate of candidates) {
    const hit = byPath.get(candidate.toLowerCase());
    if (hit && /\.html?$/i.test(hit)) return hit;
  }
  return null;
}

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

function hardenCss(css: string): string {
  return css.replace(/expression\s*\(/gi, "none(").replace(/javascript:/gi, "");
}

function rewriteCss(css: string, dir: string, files: Map<string, PromoFolderFile>, depth: number): string {
  const imported =
    depth > 4
      ? css.replace(/@import[^;]*;?/gi, "")
      : css.replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s]+)\1\s*\)?\s*;?/gi, (_full, _quote: string, ref: string) => {
          const asset = lookup(files, dir, ref);
          if (!asset || !asset.contentType.includes("css")) return "";
          return rewriteCss(decodeText(asset.bytes), dirOf(asset.path), files, depth + 1);
        });
  return hardenCss(
    imported.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, quote: string, ref: string) => {
      const trimmed = ref.trim();
      if (!trimmed || trimmed.startsWith("#") || /^(data:|blob:)/i.test(trimmed)) return full;
      const asset = lookup(files, dir, trimmed);
      if (
        !asset ||
        asset.contentType.includes("css") ||
        asset.contentType.includes("html") ||
        asset.contentType.includes("javascript")
      ) {
        return "none";
      }
      return `url(${quote}${dataUrl(asset.bytes, asset.contentType)}${quote})`;
    }),
  );
}

function rewriteSrcset(value: string, dir: string, files: Map<string, PromoFolderFile>): string {
  return value
    .split(",")
    .map((part) => {
      const bits = part.trim().split(/\s+/);
      const ref = bits[0] ?? "";
      if (/^(data:|blob:)/i.test(ref)) return bits.join(" ");
      const asset = lookup(files, dir, ref);
      if (!asset || asset.contentType.includes("html") || asset.contentType.includes("javascript") || asset.contentType.includes("css")) {
        return "";
      }
      bits[0] = dataUrl(asset.bytes, asset.contentType);
      return bits.join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function promoBaseHref(entryPath: string): string {
  const encoded = dirOf(entryPath)
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return encoded ? `${PROMO_BASE_ORIGIN}/${encoded}/` : `${PROMO_BASE_ORIGIN}/`;
}

function normalizeHash(hash: string | undefined): string {
  const trimmed = hash?.trim() ?? "";
  if (!trimmed || trimmed === "#") return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/** Keep in-folder clicks inside the preview. Hash links scroll and join history; other pages ask the parent to swap documents. */
function navigationGuard(entryPath: string, hash: string): string {
  const boot = JSON.stringify({ path: entryPath, hash }).replace(/</g, "\\u003c");
  return `(() => {
    const boot = ${boot};
    const source = ${JSON.stringify(PROMO_FRAME_MESSAGE)};
    function scrollToHash(nextHash) {
      if (!nextHash || nextHash === "#") {
        window.scrollTo(0, 0);
        return;
      }
      let id = nextHash.slice(1);
      try { id = decodeURIComponent(id); } catch (e) {}
      let el = document.getElementById(id);
      if (!el) {
        const named = document.getElementsByName(id);
        el = named && named[0] ? named[0] : null;
      }
      if (el && el.scrollIntoView) el.scrollIntoView();
      else window.scrollTo(0, 0);
    }
    function classify(href) {
      const trimmed = (href || "").trim();
      if (!trimmed || trimmed.charAt(0) === "#") return { kind: "hash", hash: trimmed };
      if (/^(javascript:|data:|blob:)/i.test(trimmed)) return { kind: "ignore" };
      let url;
      try { url = new URL(trimmed, document.baseURI); } catch (e) { return { kind: "ignore" }; }
      if (url.protocol === "mailto:" || url.protocol === "tel:") return { kind: "external", href: url.href };
      if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "ignore" };
      if (url.host !== "promo.invalid") return { kind: "external", href: url.href };
      let path = url.pathname.replace(/^\\/+/, "");
      try { path = decodeURIComponent(path); } catch (e) {}
      if (path.endsWith("/")) path = path.slice(0, -1);
      return { kind: "local", path: path, hash: url.hash || "" };
    }
    function reportHash(nextHash) {
      const hash = String(nextHash || "").slice(0, 500);
      scrollToHash(hash);
      parent.postMessage({ source: source, type: "hash", hash: hash }, "*");
    }
    function onClick(event) {
      const target = event.target;
      const anchor = target && target.closest ? target.closest("a[href], area[href]") : null;
      if (!anchor) return;
      const dest = classify(anchor.getAttribute("href") || "");
      event.preventDefault();
      if (dest.kind === "external") {
        parent.postMessage({ source: source, type: "open", href: dest.href }, "*");
        return;
      }
      if (dest.kind === "hash" || (dest.kind === "local" && (!dest.path || dest.path.toLowerCase() === boot.path.toLowerCase()))) {
        reportHash(dest.hash || "");
        return;
      }
      if (dest.kind === "local") {
        parent.postMessage({ source: source, type: "navigate", path: dest.path, hash: dest.hash || "" }, "*");
      }
    }
    window.addEventListener("message", (event) => {
      if (event.source !== parent) return;
      const data = event.data;
      if (!data || data.source !== source || data.type !== "scroll") return;
      scrollToHash(typeof data.hash === "string" ? data.hash : "");
    });
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    document.addEventListener("submit", (event) => {
      event.preventDefault();
    }, true);
    scrollToHash(boot.hash || "");
  })();`.replace(/</g, "\\u003c");
}

function promoNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Policy for the preview iframe. Author scripts, remote loads, and form posts are refused. */
export function promoFrameCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline' data:",
    "img-src data: blob:",
    "font-src data:",
    "media-src data:",
    "connect-src 'none'",
    "form-action 'none'",
    `base-uri ${PROMO_BASE_ORIGIN}`,
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
  ].join("; ");
}

function stripAuthorActiveContent(doc: Document) {
  for (const el of Array.from(doc.querySelectorAll("script, iframe, object, embed, frame, frameset, applet"))) {
    el.remove();
  }
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const name of el.getAttributeNames()) {
      if (/^on/i.test(name) || name === "ping" || name === "formaction" || name === "srcdoc") el.removeAttribute(name);
    }
  }
}

export type PromoSrcDoc = { srcDoc: string; csp: string };

/** Build a sandboxed document so the showcase cannot touch the dashboard origin. */
export function buildPromoSrcDoc(input: PromoFolderFile[], entryPath?: string, hash?: string): PromoSrcDoc | null {
  const files = new Map(input.map((file) => [file.path.toLowerCase(), file]));
  const requested = entryPath
    ? input.find((file) => file.path.toLowerCase() === entryPath.toLowerCase() && /\.html?$/i.test(file.path))
    : null;
  const entry = requested ?? findPromoIndex(input);
  if (!entry || typeof DOMParser === "undefined") return null;

  const doc = new DOMParser().parseFromString(decodeText(entry.bytes), "text/html");
  const baseDir = dirOf(entry.path);

  for (const existing of Array.from(doc.querySelectorAll("base"))) existing.remove();
  for (const meta of Array.from(doc.querySelectorAll("meta[http-equiv]"))) meta.remove();
  stripAuthorActiveContent(doc);

  for (const link of Array.from(doc.querySelectorAll("link[href]"))) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("stylesheet")) continue;
    const asset = lookup(files, baseDir, link.getAttribute("href") ?? "");
    if (!asset || !asset.contentType.includes("css")) {
      link.remove();
      continue;
    }
    const style = doc.createElement("style");
    style.textContent = rewriteCss(decodeText(asset.bytes), dirOf(asset.path), files, 0).replace(/<\/style/gi, "<\\/style");
    link.replaceWith(style);
  }

  for (const style of Array.from(doc.querySelectorAll("style"))) {
    style.textContent = rewriteCss(style.textContent ?? "", baseDir, files, 0).replace(/<\/style/gi, "<\\/style");
  }

  for (const el of Array.from(doc.querySelectorAll("[src]"))) {
    const src = el.getAttribute("src") ?? "";
    if (/^(data:|blob:)/i.test(src)) continue;
    const asset = lookup(files, baseDir, src);
    if (!asset || asset.contentType.includes("html") || asset.contentType.includes("javascript")) {
      el.removeAttribute("src");
      continue;
    }
    el.setAttribute("src", dataUrl(asset.bytes, asset.contentType));
  }

  for (const el of Array.from(doc.querySelectorAll("[srcset]"))) {
    const srcset = rewriteSrcset(el.getAttribute("srcset") ?? "", baseDir, files);
    if (srcset) el.setAttribute("srcset", srcset);
    else el.removeAttribute("srcset");
  }

  for (const link of Array.from(doc.querySelectorAll("link[href]"))) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    const href = link.getAttribute("href") ?? "";
    const risky = ["stylesheet", "preload", "modulepreload", "prefetch", "preconnect", "dns-prefetch", "prerender"].some((token) =>
      rel.includes(token),
    );
    if (risky || /^(https?:|\/\/|javascript:|data:|blob:)/i.test(href)) link.remove();
  }

  for (const el of Array.from(doc.querySelectorAll("[style]"))) {
    const value = el.getAttribute("style") ?? "";
    el.setAttribute("style", rewriteCss(value, baseDir, files, 0));
  }

  for (const anchor of Array.from(doc.querySelectorAll("a[href], area[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    anchor.removeAttribute("target");
    if (/^(javascript:|data:|blob:|vbscript:)/i.test(href)) {
      anchor.removeAttribute("href");
      continue;
    }
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  }

  for (const form of Array.from(doc.querySelectorAll("form"))) {
    form.setAttribute("action", PROMO_BASE_ORIGIN);
    form.setAttribute("method", "get");
  }

  const nonce = promoNonce();
  const csp = promoFrameCsp(nonce);
  const policy = doc.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute("content", csp);
  const base = doc.createElement("base");
  base.setAttribute("href", promoBaseHref(entry.path));
  const referrer = doc.createElement("meta");
  referrer.setAttribute("name", "referrer");
  referrer.setAttribute("content", "no-referrer");
  doc.head.insertBefore(base, doc.head.firstChild);
  doc.head.insertBefore(policy, doc.head.firstChild);
  doc.head.insertBefore(referrer, doc.head.firstChild);

  // Insert the guard as text. Serializing a script nonce through outerHTML drops the value.
  const html = `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
  const script = `<script nonce="${nonce}">${navigationGuard(entry.path, normalizeHash(hash))}</script>`;
  const closeBody = html.lastIndexOf("</body>");
  const srcDoc = closeBody === -1 ? `${html}${script}` : `${html.slice(0, closeBody)}${script}${html.slice(closeBody)}`;
  return { srcDoc, csp };
}
