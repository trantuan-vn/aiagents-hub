export type ConnectionType = "main" | "branch" | "resource";

export interface HandleDefinition {
  id: string;
  type: "source" | "target";
  connectionType: ConnectionType;
  maxConnections?: number;
  position?: "top" | "bottom" | "left" | "right";
}
