export type AgentStatus = 'ok' | 'needs_clarification' | 'refused';

export type SafetyCategory = 'illegal' | 'harmful' | 'jailbreak' | 'policy';

export type ClarificationMode = 'ask' | 'best_effort';

export type PlannerMode = 'auto' | 'on' | 'off' | boolean;

export type SafetyLevel = 'standard' | 'strict';

export type PlanStep = {
  id: string;
  action: string;
  tool?: string;
  successCriterion?: string;
  risk?: 'low' | 'high';
};

export type AgentPlan = {
  steps: PlanStep[];
};

export type TaskFrame = {
  goal: string;
  knownFacts: string[];
  missingSlots: string[];
  confidence: number;
  canUseTools: boolean;
};

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
};

export type ReasoningOptions = {
  clarificationMode: ClarificationMode;
  requireCitations: boolean;
  maxReflectRetries: number;
  noImprovementLimit: number;
  enablePlanner: PlannerMode;
  safetyLevel: SafetyLevel;
};

export type ReasoningResult = {
  status: AgentStatus;
  text: string;
  citations: AgentCitation[];
  plan?: PlanStep[];
  questions?: string[];
  confidence: number;
  reason?: string;
  category?: SafetyCategory;
  frame?: TaskFrame;
};

export const ASK_USER_TOOL = 'ask_user';
export const RETRIEVE_MEMORY_TOOL = 'retrieve_memory';

export const MAX_ACT_STEPS = 12;
export const DEFAULT_ACT_STEPS = 8;
export const MAX_EPISODES = 20;
