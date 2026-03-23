"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied", duration: 1500 });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm text-zinc-100 dark:bg-zinc-900">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 bg-zinc-800 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-700"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </Button>
      <span className="absolute top-2 left-2 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
        {language}
      </span>
    </div>
  );
}
