export type AgentStatus = 'ok' | 'needs_clarification' | 'refused';

export type SafetyCategory = 'illegal' | 'harmful' | 'jailbreak' | 'policy';

export type ClarificationMode = 'ask' | 'best_effort';

export type SafetyLevel = 'standard' | 'strict';

export type AgentCitation = {
  id: number;
  source: string;
  snippet: string;
  tool?: string;
};

export type ToolObservation = {
  tool: string;
  ok: boolean;
  output: string;
  input?: string;
};

export type ReasoningOptions = {
  clarificationMode: ClarificationMode;
  requireCitations: boolean;
  /** SQL mode: how many times a failed statement may be repaired from the engine error. */
  maxRepairs: number;
  /** Generic mode: tool-calling steps in the single act turn. */
  maxActSteps: number;
  safetyLevel: SafetyLevel;
  trace: boolean;
};

export type ReasoningResult = {
  status: AgentStatus;
  text: string;
  citations: AgentCitation[];
  questions?: string[];
  confidence: number;
  reason?: string;
  category?: SafetyCategory;
  /** One runnable statement with a trailing semicolon. Empty when no SQL was produced. */
  sql?: string;
  /** True only when the validator accepted `sql`. */
  validated?: boolean;
  columns?: string[];
  rowCount?: number;
  attempts?: number;
};

export const ASK_USER_TOOL = 'ask_user';
export const RETRIEVE_MEMORY_TOOL = 'retrieve_memory';

export const MAX_ACT_STEPS = 12;
export const DEFAULT_ACT_STEPS = 8;
export const MAX_REPAIRS = 5;
export const MAX_EPISODES = 20;
