/** Merge sidebar service endpoint into all agent nodes before save. */
export function mergeAgentServiceEndpoint(definitionJson: string, serviceEndpoint: string): string {
  try {
    const def = JSON.parse(definitionJson) as {
      nodes?: Array<{ type?: string; data?: Record<string, unknown> }>;
      edges?: unknown[];
      viewport?: unknown;
    };
    if (!def.nodes?.length) return definitionJson;
    def.nodes = def.nodes.map((n) =>
      n.type === "agent"
        ? {
            ...n,
            data: {
              ...(n.data ?? {}),
              serviceEndpoint: serviceEndpoint || n.data?.serviceEndpoint,
            },
          }
        : n,
    );
    return JSON.stringify(def);
  } catch {
    return definitionJson;
  }
}

export function readServiceEndpointFromDefinition(definitionJson: string): string {
  try {
    const def = JSON.parse(definitionJson) as {
      nodes?: Array<{ type?: string; data?: { serviceEndpoint?: string } }>;
    };
    const agent = def.nodes?.find((n) => n.type === "agent");
    return String(agent?.data?.serviceEndpoint ?? "");
  } catch {
    return "";
  }
}
