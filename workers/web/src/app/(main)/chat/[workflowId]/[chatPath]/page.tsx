import { getTranslations } from "next-intl/server";

import { PublicHostedChatPage } from "@/app/(main)/dashboard/build/workflows/_components/chat/public-hosted-chat-page";
import { isDashboardAssistantPublicChat } from "@/app/(main)/dashboard/control/assistant/assistant-config";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string; chatPath: string }>;
  searchParams: Promise<{ owner_id?: string }>;
}) {
  const { workflowId, chatPath } = await params;
  const { owner_id: ownerId } = await searchParams;
  const id = Number.parseInt(workflowId, 10);
  const path = decodeURIComponent(chatPath);
  if (isDashboardAssistantPublicChat({ workflowId: Number.isNaN(id) ? 0 : id, chatPath: path, ownerId })) {
    const t = await getTranslations("WorkflowEditorPage");
    return (
      <div className="flex h-full min-h-screen items-center justify-center px-4">
        <div className="bg-background max-w-md rounded-xl border p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold">{t("chat_unavailable_title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{t("chat_unavailable")}</p>
        </div>
      </div>
    );
  }
  return (
    <PublicHostedChatPage
      workflowId={Number.isNaN(id) ? 0 : id}
      chatPath={path}
      ownerId={ownerId}
      mode="production"
    />
  );
}
