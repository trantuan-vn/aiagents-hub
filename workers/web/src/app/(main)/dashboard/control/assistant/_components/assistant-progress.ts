import { applyChatRunEvent, type ChatProgressEvent, type ChatRunStep } from "../../../build/workflows/_components/chat/chat-run-log";

export type AssistantRunResult = {
  output: string;
  executionKey?: string;
  status?: string;
};

function parseEventBlock(block: string): Record<string, unknown> | null {
  const line = block
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("data:"));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function postAssistantChat(params: {
  endpointUrl: string;
  sessionId: string;
  chatInput: string;
  signal: AbortSignal;
  onProgress: (steps: ChatRunStep[]) => void;
}): Promise<AssistantRunResult> {
  const response = await fetch(params.endpointUrl, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "text/event-stream, application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sendMessage",
      sessionId: params.sessionId,
      chatInput: params.chatInput,
    }),
    signal: params.signal,
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok && !contentType.includes("text/event-stream")) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof body.error === "string" ? body.error : "Chat workflow failed");
  }
  if (!response.body || !contentType.includes("text/event-stream")) {
    const body = (await response.json().catch(() => ({}))) as { output?: unknown; error?: unknown };
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "Chat workflow failed");
    }
    return { output: typeof body.output === "string" ? body.output : JSON.stringify(body.output ?? "") };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let steps: ChatRunStep[] = [];
  let result: AssistantRunResult | null = null;
  const consume = (block: string) => {
    const data = parseEventBlock(block);
    if (!data) return;
    if (data.type === "error") throw new Error(String(data.error ?? "Chat workflow failed"));
    if (data.type === "result") {
      const output = data.output;
      result = {
        output: typeof output === "string" ? output : JSON.stringify(output ?? ""),
        executionKey: typeof data.executionKey === "string" ? data.executionKey : undefined,
        status: typeof data.status === "string" ? data.status : undefined,
      };
      return;
    }
    steps = applyChatRunEvent(steps, data as ChatProgressEvent);
    params.onProgress(steps);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) consume(block);
  }
  if (buffer.trim()) consume(buffer);
  if (!result) throw new Error("Chat workflow failed");
  return result;
}
