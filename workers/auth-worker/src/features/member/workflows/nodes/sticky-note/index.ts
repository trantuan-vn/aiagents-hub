import type { WorkflowNodePlugin } from '../types.js';

/** Sticky note annotation — canvas-only. */
export const stickyNotePlugin: WorkflowNodePlugin = {
  id: 'sticky_note',
  runtimeType: 'sticky_note',
  skipExecution: true,
};
