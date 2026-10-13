"use client";

import { useEffect, useRef } from "react";

const replyClassName =
  "text-sm break-words [&_a]:text-primary [&_a]:break-all [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mt-1 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:leading-relaxed [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:text-xs [&_svg]:my-2 [&_svg]:h-auto [&_svg]:max-w-full [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

export function AssistantReply({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>("pre.mermaid")];
    if (!nodes.length) return;
    let cancelled = false;
    void import("mermaid")
      .then(async (mod) => {
        if (cancelled) return;
        const mermaid = mod.default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
        });
        try {
          await mermaid.run({ nodes });
        } catch {
          // Keep the diagram source on screen when it cannot be drawn.
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [html]);

  return <div ref={ref} className={replyClassName} dangerouslySetInnerHTML={{ __html: html }} />;
}
