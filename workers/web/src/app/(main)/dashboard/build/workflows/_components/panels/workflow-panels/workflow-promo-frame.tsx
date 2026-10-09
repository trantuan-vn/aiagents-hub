"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { PromoFolderFile } from "../../../_lib/promo-folder";
import { buildPromoSrcDoc, findPromoIndex, PROMO_FRAME_MESSAGE, resolvePromoPage } from "../../../_lib/promo-srcdoc";

interface WorkflowPromoFrameProps {
  files: PromoFolderFile[];
  address: string;
  emptyLabel: string;
  title: string;
  backLabel: string;
  forwardLabel: string;
  refreshLabel: string;
}

type PromoHistoryEntry = {
  path: string;
  hash: string;
};

function cleanPromoHash(hash: unknown): string {
  if (typeof hash !== "string") return "";
  const trimmed = hash.trim().slice(0, 500);
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function sameHistoryEntry(a: PromoHistoryEntry, b: PromoHistoryEntry): boolean {
  return a.path.toLowerCase() === b.path.toLowerCase() && a.hash === b.hash;
}

function safeExternalUrl(href: string): string | null {
  if (href.length > 2000) return null;
  try {
    const url = new URL(href);
    if (url.username || url.password || url.hostname === "promo.invalid") return null;
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function WorkflowPromoFrame({
  files,
  address,
  emptyLabel,
  title,
  backLabel,
  forwardLabel,
  refreshLabel,
}: WorkflowPromoFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const [history, setHistory] = useState<PromoHistoryEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const historyRef = useRef(history);
  const cursorRef = useRef(cursor);
  historyRef.current = history;
  cursorRef.current = cursor;
  const frameHashRef = useRef("");
  const paintRef = useRef<{ path: string; hash: string; reload: number } | null>(null);
  const filesKey = useMemo(() => files.map((file) => `${file.path}:${file.bytes.byteLength}`).join("\n"), [files]);
  const indexPath = useMemo(() => findPromoIndex(files)?.path ?? null, [files]);
  const indexPathRef = useRef(indexPath);
  indexPathRef.current = indexPath;
  const entry = history[cursor];
  const entryMatches = Boolean(entry && files.some((file) => file.path.toLowerCase() === entry.path.toLowerCase()));
  const activePath = entryMatches && entry ? entry.path : indexPath;
  const entryHash = entryMatches && entry ? entry.hash : "";
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  useEffect(() => {
    historyRef.current = [];
    cursorRef.current = 0;
    frameHashRef.current = "";
    paintRef.current = null;
    setHistory([]);
    setCursor(0);
  }, [filesKey]);

  function pushHistory(path: string, hash: string, fromFrame: boolean) {
    const current = historyRef.current;
    const index = cursorRef.current;
    const indexPathNow = indexPathRef.current;
    const start =
      current.length === 0 ? (indexPathNow ? [{ path: indexPathNow, hash: "" }] : []) : current.slice(0, index + 1);
    const entry = { path, hash };
    const last = start[start.length - 1];
    if (last && sameHistoryEntry(last, entry)) return;
    const next = [...start, entry];
    if (fromFrame) frameHashRef.current = hash;
    historyRef.current = next;
    cursorRef.current = next.length - 1;
    setHistory(next);
    setCursor(next.length - 1);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; path?: string; hash?: string; href?: string } | null;
      if (!data || data.source !== PROMO_FRAME_MESSAGE) return;
      if (data.type === "hash") {
        const path = activePathRef.current ?? indexPathRef.current;
        if (!path) return;
        pushHistory(path, cleanPromoHash(data.hash), true);
        return;
      }
      if (data.type === "navigate" && typeof data.path === "string") {
        const resolved = resolvePromoPage(filesRef.current, data.path);
        if (!resolved) return;
        const hash = cleanPromoHash(data.hash);
        const samePage = resolved.toLowerCase() === (activePathRef.current ?? "").toLowerCase();
        if (samePage && !hash) return;
        pushHistory(resolved, hash, samePage);
        return;
      }
      if (data.type === "open" && typeof data.href === "string") {
        const href = safeExternalUrl(data.href);
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const path = activePath ?? "";
    const previous = paintRef.current;
    const sameDocument = previous != null && previous.path === path && previous.reload === reloadTick;
    paintRef.current = { path, hash: entryHash, reload: reloadTick };
    if (!sameDocument) {
      frameHashRef.current = entryHash;
      return;
    }
    if (frameHashRef.current === entryHash) return;
    frameHashRef.current = entryHash;
    iframeRef.current?.contentWindow?.postMessage(
      { source: PROMO_FRAME_MESSAGE, type: "scroll", hash: entryHash },
      "*",
    );
  }, [activePath, entryHash, reloadTick]);

  function goBack() {
    const index = cursorRef.current;
    if (index <= 0) return;
    cursorRef.current = index - 1;
    setCursor(index - 1);
  }

  function goForward() {
    const index = cursorRef.current;
    if (index >= historyRef.current.length - 1) return;
    cursorRef.current = index + 1;
    setCursor(index + 1);
  }

  const previewKey = `${filesKey}\n${activePath ?? ""}\n${reloadTick}`;
  const previewKeyRef = useRef("");
  const previewRef = useRef<ReturnType<typeof buildPromoSrcDoc>>(null);
  if (previewKeyRef.current !== previewKey) {
    previewKeyRef.current = previewKey;
    previewRef.current = files.length > 0 ? buildPromoSrcDoc(files, activePath ?? undefined, entryHash) : null;
  }
  const preview = previewRef.current;
  const pageLabel = activePath && indexPath && activePath.toLowerCase() !== indexPath.toLowerCase() ? activePath : address;
  const addressLabel = entryHash ? `${pageLabel}${entryHash}` : pageLabel;
  const canGoBack = cursor > 0;
  const canGoForward = cursor < history.length - 1;

  return (
    <div className="bg-background flex h-full min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canGoBack}
          aria-label={backLabel}
          title={backLabel}
          onClick={goBack}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!canGoForward}
          aria-label={forwardLabel}
          title={forwardLabel}
          onClick={goForward}
        >
          <ChevronRight />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={!preview}
          aria-label={refreshLabel}
          title={refreshLabel}
          onClick={() => setReloadTick((tick) => tick + 1)}
        >
          <RefreshCw />
        </Button>
        <div className="bg-muted text-muted-foreground ml-1 min-w-0 flex-1 truncate rounded-md px-3 py-1 text-xs">
          {addressLabel}
        </div>
      </div>
      {preview ? (
        <iframe
          ref={iframeRef}
          key={`${activePath ?? "index"}:${reloadTick}`}
          title={title}
          className="min-h-0 w-full flex-1 bg-white"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          // The iframe csp attribute is valid HTML but missing from the DOM typings.
          // @ts-expect-error csp is not declared on IframeHTMLAttributes
          csp={preview.csp}
          srcDoc={preview.srcDoc}
        />
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-6 text-center text-sm">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
