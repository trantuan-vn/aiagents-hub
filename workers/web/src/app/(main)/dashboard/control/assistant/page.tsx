"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";

import { AssistantChat } from "./_components/assistant-chat";

export default function AssistantPage() {
  const t = useTranslations("AssistantPage");

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Bot className="text-muted-foreground h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
        </div>
      </div>
      <AssistantChat />
    </div>
  );
}
