"use client";

import { Panel } from "@xyflow/react";
import type { WebhookItemOutput } from "@aiagents-hub/workflow-nodes";

import { WebhookListeningPanel } from "../panels/node-config/webhook-listening-panel";

type WorkflowCanvasWebhookListeningPanelProps = {
  testUrl: string;
  liveOutput?: WebhookItemOutput | null;
  onStop: () => void;
};

export function WorkflowCanvasWebhookListeningPanel({
  testUrl,
  liveOutput,
  onStop,
}: WorkflowCanvasWebhookListeningPanelProps) {
  return (
    <Panel position="top-center" className="nodrag nopan !m-3 !p-0">
      <div
        className="bg-background nodrag nopan w-[min(22rem,calc(100vw-6rem))] overflow-hidden rounded-lg border shadow-lg"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <WebhookListeningPanel compact testUrl={testUrl} onStop={onStop} receivedOutput={liveOutput} />
      </div>
    </Panel>
  );
}
