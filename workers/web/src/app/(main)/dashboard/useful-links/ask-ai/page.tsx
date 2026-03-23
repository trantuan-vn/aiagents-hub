"use client";

import { AskAiChat } from "./_components/ask-ai-chat";

export default function AskAiPage() {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[500px] flex-col gap-4">
      <div className="bg-card flex min-h-0 flex-1 overflow-hidden rounded-xl border">
        <AskAiChat />
      </div>
    </div>
  );
}
