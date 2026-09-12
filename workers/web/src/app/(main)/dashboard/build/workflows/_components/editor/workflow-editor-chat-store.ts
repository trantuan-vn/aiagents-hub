import {
  newChatSessionId,
  seedChatTriggerMessages,
  type ChatTriggerMessage,
} from "../chat/chat-trigger-conversation";

export type WorkflowEditorChatState = {
  open: boolean;
  workflowId: number | null;
  nodeId: string | null;
  sessionId: string;
  endpointUrl: string;
  initialMessages: string;
  inputPlaceholder: string;
  title: string;
  messages: ChatTriggerMessage[];
  sending: boolean;
};

const INITIAL: WorkflowEditorChatState = {
  open: false,
  workflowId: null,
  nodeId: null,
  sessionId: "",
  endpointUrl: "",
  initialMessages: "",
  inputPlaceholder: "",
  title: "",
  messages: [],
  sending: false,
};

let state: WorkflowEditorChatState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const workflowEditorChatStore = {
  getState: (): WorkflowEditorChatState => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  open: (params: {
    workflowId: number;
    nodeId: string;
    endpointUrl: string;
    initialMessages?: string;
    inputPlaceholder?: string;
    title?: string;
  }) => {
    const sameSession = state.workflowId === params.workflowId && state.nodeId === params.nodeId && state.sessionId;
    const initialMessages = params.initialMessages ?? "";
    state = {
      open: true,
      workflowId: params.workflowId,
      nodeId: params.nodeId,
      endpointUrl: params.endpointUrl,
      initialMessages,
      inputPlaceholder: params.inputPlaceholder ?? "",
      title: params.title ?? "",
      sending: sameSession ? state.sending : false,
      sessionId: sameSession ? state.sessionId : newChatSessionId(),
      messages: sameSession ? state.messages : seedChatTriggerMessages(initialMessages),
    };
    emit();
  },

  show: () => {
    if (!state.nodeId) return;
    if (state.open) return;
    state = { ...state, open: true };
    emit();
  },

  hide: () => {
    if (!state.open) return;
    state = { ...state, open: false };
    emit();
  },

  close: () => {
    if (state === INITIAL) return;
    state = INITIAL;
    emit();
  },

  setMessages: (messages: ChatTriggerMessage[]) => {
    if (state.messages === messages) return;
    state = { ...state, messages };
    emit();
  },

  setSending: (sending: boolean) => {
    if (state.sending === sending) return;
    state = { ...state, sending };
    emit();
  },
};
