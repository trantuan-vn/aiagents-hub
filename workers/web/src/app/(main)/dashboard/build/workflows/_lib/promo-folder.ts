/**
 * Client-side checks for a static showcase folder.
 * Keep the limits and path rules aligned with auth-worker promo-site.ts.
 */

export const PROMO_MAX_FILES = 60;
export const PROMO_MAX_FILE_BYTES = 1_500_000;
export const PROMO_MAX_TOTAL_BYTES = 5_000_000;

export type PromoFolderError = "empty" | "missing_index" | "too_many" | "too_large" | "bad_file";

export type PromoFolderFile = {
  path: string;
  bytes: Uint8Array;
  contentType: string;
};

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  webmanifest: "application/manifest+json",
  map: "application/json",
};

function contentTypeForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? null;
}

function isIgnoredPath(path: string): boolean {
  return path.split("/").some(
    (part) => part === "__MACOSX" || part === ".DS_Store" || part === "Thumbs.db" || part.startsWith("."),
  );
}

function cleanPath(raw: string): string | null {
  const path = raw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!path || path.length > 180 || /[\u0000-\u001f]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

function hoistPromoPaths(paths: string[]): string[] {
  let current = paths.slice();
  for (let depth = 0; depth < 4; depth += 1) {
    if (current.some((path) => /^index\.html?$/i.test(path))) return current;
    if (current.length === 0 || current.some((path) => !path.includes("/"))) return current;
    const root = current[0].split("/")[0];
    if (current.some((path) => path.split("/")[0] !== root)) return current;
    current = current.map((path) => path.slice(path.indexOf("/") + 1));
  }
  return current;
}

export function normalizePromoFolder(
  input: Array<{ path: string; bytes: Uint8Array }>,
): { ok: true; files: PromoFolderFile[] } | { ok: false; error: PromoFolderError } {
  const cleaned: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const file of input) {
    const path = cleanPath(file.path);
    if (!path) return { ok: false, error: "bad_file" };
    if (isIgnoredPath(path)) continue;
    cleaned.push({ path, bytes: file.bytes });
  }
  if (cleaned.length === 0) return { ok: false, error: "empty" };

  const hoisted = hoistPromoPaths(cleaned.map((file) => file.path));
  const byPath = new Map<string, PromoFolderFile>();
  for (let i = 0; i < cleaned.length; i += 1) {
    const path = hoisted[i];
    if (!path || isIgnoredPath(path)) continue;
    const contentType = contentTypeForPath(path);
    if (!contentType) return { ok: false, error: "bad_file" };
    byPath.set(path.toLowerCase(), { path, bytes: cleaned[i].bytes, contentType });
  }

  const files = [...byPath.values()];
  if (files.length === 0) return { ok: false, error: "empty" };
  if (files.length > PROMO_MAX_FILES) return { ok: false, error: "too_many" };
  if (!files.some((file) => /^index\.html?$/i.test(file.path))) return { ok: false, error: "missing_index" };

  let total = 0;
  for (const file of files) {
    if (file.bytes.byteLength > PROMO_MAX_FILE_BYTES) return { ok: false, error: "too_large" };
    total += file.bytes.byteLength;
    if (total > PROMO_MAX_TOTAL_BYTES) return { ok: false, error: "too_large" };
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, files };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function formatPromoBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file: (success: (file: File) => void, error?: (err: DOMException) => void) => void;
  createReader: () => { readEntries: (success: (entries: FsEntry[]) => void, error?: (err: DOMException) => void) => void };
};

async function readAllEntries(reader: ReturnType<FsEntry["createReader"]>): Promise<FsEntry[]> {
  const all: FsEntry[] = [];
  for (;;) {
    const batch = await new Promise<FsEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function collectEntry(entry: FsEntry): Promise<Array<{ path: string; file: File }>> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ path: entry.fullPath.replace(/^\/+/, ""), file }];
  }
  if (!entry.isDirectory) return [];
  const children = await readAllEntries(entry.createReader());
  const nested = await Promise.all(children.map((child) => collectEntry(child)));
  return nested.flat();
}

async function toBytes(picked: Array<{ path: string; file: File }>) {
  return Promise.all(
    picked.map(async (item) => ({
      path: item.path || item.file.name,
      bytes: new Uint8Array(await item.file.arrayBuffer()),
    })),
  );
}

export async function promoFilesFromList(list: FileList | File[]): Promise<Array<{ path: string; bytes: Uint8Array }>> {
  const files = Array.from(list);
  return toBytes(
    files.map((file) => ({
      path: (file.webkitRelativePath || file.name).replace(/\\/g, "/"),
      file,
    })),
  );
}

export async function promoFilesFromDataTransfer(data: DataTransfer): Promise<Array<{ path: string; bytes: Uint8Array }>> {
  const entries: FsEntry[] = [];
  for (const item of Array.from(data.items ?? [])) {
    const entry = item.webkitGetAsEntry?.() as FsEntry | null;
    if (entry) entries.push(entry);
  }
  if (entries.length > 0) {
    const picked = (await Promise.all(entries.map((entry) => collectEntry(entry)))).flat();
    return toBytes(picked);
  }
  return promoFilesFromList(Array.from(data.files ?? []));
}
