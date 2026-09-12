import { PublicHostedChatPage } from "@/app/(main)/dashboard/build/workflows/_components/chat/public-hosted-chat-page";

export default async function ChatTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string; chatPath: string }>;
  searchParams: Promise<{ owner_id?: string }>;
}) {
  const { workflowId, chatPath } = await params;
  const { owner_id: ownerId } = await searchParams;
  const id = Number.parseInt(workflowId, 10);
  return (
    <PublicHostedChatPage
      workflowId={Number.isNaN(id) ? 0 : id}
      chatPath={decodeURIComponent(chatPath)}
      ownerId={ownerId}
      mode="test"
    />
  );
}
