import type { WorkflowNodeUIPlugin } from "../types";
import { StickyNoteNode } from "./canvas";

export { StickyNoteNode } from "./canvas";

export const stickyNoteUIPlugin: WorkflowNodeUIPlugin = {
  id: "sticky_note",
  runtimeType: "sticky_note",
  Canvas: StickyNoteNode,
  defaults: () => ({ label: "Note", content: "" }),
  catalog: {
    category: "core",
    labelKey: "node_sticky_note",
    descriptionKey: "node_sticky_note_desc",
    icon: "StickyNote",
    visible: false,
  },
};
