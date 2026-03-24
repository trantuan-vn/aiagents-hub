"use client";

import { useCallback, useMemo, useState } from "react";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const LANG_ORDER = ["curl", "javascript", "python", "go", "php", "java", "csharp"] as const;

type Lang = (typeof LANG_ORDER)[number];

function langLabel(lang: Lang): string {
  switch (lang) {
    case "curl":
      return "cURL";
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "go":
      return "Go";
    case "php":
      return "PHP";
    case "java":
      return "Java";
    case "csharp":
      return "C#";
  }
}

function pickExampleFn(
  examples: Partial<Record<Lang, (apiKey: string) => string>>,
  lang: Lang,
): ((apiKey: string) => string) | undefined {
  switch (lang) {
    case "curl":
      return examples.curl;
    case "javascript":
      return examples.javascript;
    case "python":
      return examples.python;
    case "go":
      return examples.go;
    case "php":
      return examples.php;
    case "java":
      return examples.java;
    case "csharp":
      return examples.csharp;
  }
}

type Props = {
  examples: Partial<Record<Lang, (apiKey: string) => string>>;
  className?: string;
};

export function DocsCodeSample({ examples, className }: Props) {
  const t = useTranslations("Docs");
  const [copied, setCopied] = useState(false);

  const available = useMemo(() => {
    return LANG_ORDER.filter((lang) => typeof pickExampleFn(examples, lang) === "function");
  }, [examples]);

  const [tab, setTab] = useState<string>(() => available[0] ?? "curl");

  const copyText = useCallback(
    async (lang: Lang) => {
      const fn = pickExampleFn(examples, lang);
      if (!fn) return;
      const text = fn(t("placeholder_api_key"));
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    },
    [examples, t],
  );

  if (available.length === 0) return null;

  return (
    <div className={cn("bg-muted/40 border-border overflow-hidden rounded-xl border", className)}>
      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        <div className="bg-muted/60 flex flex-wrap items-center justify-between gap-2 border-b px-2 py-2 sm:px-3">
          <TabsList className="bg-background/80 h-auto flex-wrap justify-start gap-1 p-1">
            {available.map((lang) => (
              <TabsTrigger key={lang} value={lang} className="text-xs sm:text-sm">
                {langLabel(lang)}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={() => {
              if (LANG_ORDER.includes(tab as Lang)) void copyText(tab as Lang);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
        {available.map((lang) => {
          const fn = pickExampleFn(examples, lang);
          if (!fn) return null;
          return (
            <TabsContent key={lang} value={lang} className="mt-0">
              <pre className="text-muted-foreground max-h-[min(70vh,520px)] overflow-auto p-4 text-left text-xs leading-relaxed sm:text-sm">
                <code>{fn(t("placeholder_api_key"))}</code>
              </pre>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
