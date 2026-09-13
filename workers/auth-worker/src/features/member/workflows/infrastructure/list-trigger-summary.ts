type WorkflowListNode = {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
};

export type SharedWorkflowTriggerSummary = {
  chat: { public: boolean; path: string; hosted: boolean } | null;
  forms: { nodeId: string; label: string; path: string }[];
  webhooks: { nodeId: string; label: string; path: string }[];
};

function parseNodes(raw: unknown): WorkflowListNode[] {
  if (raw == null || raw === '') return [];
  let def: unknown = raw;
  if (typeof raw === 'string') {
    try {
      def = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const nodes = (def as { nodes?: WorkflowListNode[] }).nodes;
  return Array.isArray(nodes) ? nodes : [];
}

function nodeData(node: WorkflowListNode): Record<string, unknown> {
  return node.data ?? {};
}

function nodeLabel(node: WorkflowListNode, fallback: string): string {
  const label = nodeData(node).label;
  return typeof label === 'string' && label.trim() ? label.trim() : fallback;
}

function defaultPath(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36) || nodeId;
}

function resolvePath(custom: unknown, nodeId: string): string {
  const value = String(custom ?? '')
    .trim()
    .replace(/^\/+/, '');
  return value || defaultPath(nodeId);
}

function isChatNode(node: WorkflowListNode): boolean {
  const data = nodeData(node);
  return data.triggerKind === 'chat' || node.type === 'chat';
}

function isFormTriggerNode(node: WorkflowListNode): boolean {
  const data = nodeData(node);
  return (data.triggerKind === 'form' && data.formKind !== 'database') || node.type === 'form';
}

function isWebhookTriggerNode(node: WorkflowListNode): boolean {
  const data = nodeData(node);
  return data.coreKind === 'webhook' || data.triggerKind === 'webhook' || node.type === 'webhook';
}

/** Compact trigger metadata for community list cards — no full graph. */
export function summarizeWorkflowListTriggers(definition: unknown): SharedWorkflowTriggerSummary {
  const nodes = parseNodes(definition).filter((node) => typeof node.id === 'string' && node.id);

  const chats = nodes.filter(isChatNode).map((node) => {
    const data = nodeData(node);
    return {
      public: data.chatPublic !== false,
      path: resolvePath(data.chatPath, String(node.id)),
      hosted: String(data.chatMode ?? 'hostedChat') !== 'webhook',
    };
  });

  return {
    chat: chats.find((entry) => entry.public) ?? chats.at(0) ?? null,
    forms: nodes.filter(isFormTriggerNode).map((node) => {
      const data = nodeData(node);
      const nodeId = String(node.id);
      return {
        nodeId,
        label: nodeLabel(node, 'Form'),
        path: resolvePath(data.formPath, nodeId),
      };
    }),
    webhooks: nodes.filter(isWebhookTriggerNode).map((node) => {
      const data = nodeData(node);
      const nodeId = String(node.id);
      return {
        nodeId,
        label: nodeLabel(node, 'Webhook'),
        path: resolvePath(data.webhookPath, nodeId),
      };
    }),
  };
}
