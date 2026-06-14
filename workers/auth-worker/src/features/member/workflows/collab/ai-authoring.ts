import { generateText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import type { z } from 'zod';

import { WorkflowDefinitionSchema } from '../domain/domain.js';

type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * AI-native authoring helpers:
 *  - generateWorkflowDefinition: natural-language prompt -> validated WorkflowDefinition
 *  - autofixWorkflowDefinition: broken/failing definition (+ error) -> repaired definition
 *
 * Both use Workers AI (through the AI Gateway) and validate the model output
 * against the same zod schema the editor uses, with a single repair retry so
 * malformed JSON does not surface to the user.
 */

const AUTHORING_MODEL = '@cf/zai-org/glm-4.7-flash';
const AI_GATEWAY_ID = 'unitoken';

export interface GenerateResult {
  definition: WorkflowDefinition;
  notes: string;
}

type Json = Record<string, unknown>;

const NODE_GUIDE = `Available node "type" values and their typical "data" fields:
- "trigger": entry point. data: { "label": string, "kind": "manual"|"webhook"|"cron" }
- "agent": LLM step. data: { "label": string, "systemPrompt": string, "maxTokens"?: number }. Leave "serviceEndpoint" empty; the user wires the model later.
- "http_request": call an external API. data: { "label": string, "method": "GET"|"POST"|"PUT"|"DELETE", "url": string, "headers"?: object, "body"?: string, "asTool"?: boolean }
- "code": safe data transform (no arbitrary JS). data: { "label": string, "mode": "template"|"jsonata", "expression": string }
- "data_transformation": map/shape data. data: { "label": string, "expression": string }
- "human_review": pause for approval. data: { "label": string, "autoApprove"?: boolean }
- "flow": branching/loop helper. data: { "label": string }
- "core" / "action_in_app": built-in actions. data: { "label": string }

Use template interpolation {{ nodeId.output.path }} to pass data between nodes.`;

function buildSystemPrompt(): string {
  return [
    'You are a workflow architect for an n8n-style automation builder.',
    'You convert a user request into a directed graph of nodes (a WorkflowDefinition).',
    NODE_GUIDE,
    'Rules:',
    '- Always start with exactly one "trigger" node.',
    '- Give every node a short, unique string "id" (e.g. "trigger", "agent_1", "http_1").',
    '- Connect nodes with edges: { "id": string, "source": <nodeId>, "target": <nodeId> }.',
    '- Keep it minimal but complete: only the nodes needed to fulfil the request.',
    '- Positions can be omitted; they will be auto-laid-out.',
    'Respond with ONLY a JSON object of the form:',
    '{ "definition": { "nodes": [...], "edges": [...] }, "notes": "one short sentence" }',
    'No markdown fences, no commentary outside the JSON.',
  ].join('\n');
}

/** Strip code fences and isolate the outermost JSON object. */
function extractJson(text: string): Json | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as Json;
  } catch {
    return null;
  }
}

/** Assign a simple left-to-right layout and backfill missing edge ids/positions. */
function normalizeDefinition(def: Json): Json {
  const nodes = Array.isArray(def.nodes) ? (def.nodes as Json[]) : [];
  const edges = Array.isArray(def.edges) ? (def.edges as Json[]) : [];
  nodes.forEach((node, index) => {
    if (!node.position || typeof node.position !== 'object') {
      node.position = { x: 120 + index * 280, y: 160 + (index % 2) * 120 };
    }
    if (!node.data || typeof node.data !== 'object') node.data = {};
  });
  edges.forEach((edge, index) => {
    if (!edge.id) edge.id = `e_${index}_${String(edge.source ?? '')}_${String(edge.target ?? '')}`;
  });
  return { nodes, edges, viewport: def.viewport };
}

async function callModel(
  env: { AI: unknown },
  system: string,
  prompt: string,
): Promise<string> {
  const workersAI = createWorkersAI({
    binding: env.AI as never,
    gateway: { id: AI_GATEWAY_ID },
  });
  const result = await generateText({
    model: workersAI(AUTHORING_MODEL as never),
    system,
    prompt,
    maxOutputTokens: 2048,
  });
  return result.text ?? '';
}

async function generateValidated(
  env: { AI: unknown },
  system: string,
  prompt: string,
): Promise<GenerateResult> {
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const fullPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous answer was invalid: ${lastError}. Return corrected JSON only.`;
    const raw = await callModel(env, system, fullPrompt);
    const parsed = extractJson(raw);
    if (!parsed) {
      lastError = 'response was not valid JSON';
      continue;
    }
    const candidate = (parsed.definition ?? parsed) as Json;
    const normalized = normalizeDefinition(candidate);
    const validated = WorkflowDefinitionSchema.safeParse(normalized);
    if (validated.success) {
      const notes =
        typeof parsed.notes === 'string'
          ? parsed.notes
          : typeof parsed.explanation === 'string'
            ? (parsed.explanation as string)
            : '';
      return { definition: validated.data, notes };
    }
    lastError = validated.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
  }
  throw new Error(`AI could not produce a valid workflow (${lastError})`);
}

export async function generateWorkflowDefinition(
  env: { AI: unknown },
  prompt: string,
): Promise<GenerateResult> {
  const clean = prompt.trim();
  if (!clean) throw new Error('Prompt is required');
  return generateValidated(env, buildSystemPrompt(), `Build a workflow that: ${clean}`);
}

export async function autofixWorkflowDefinition(
  env: { AI: unknown },
  definition: unknown,
  errorContext?: string,
): Promise<GenerateResult> {
  const system = [
    buildSystemPrompt(),
    '',
    'You are now in REPAIR mode. The user provides an existing workflow that is broken or failing.',
    'Fix structural problems (missing trigger, dangling edges, invalid node data, disconnected nodes)',
    'and address the reported error if any. Preserve the user\'s intent and keep working nodes intact.',
  ].join('\n');
  const defJson = JSON.stringify(definition);
  const prompt = [
    'Current workflow definition (JSON):',
    defJson,
    errorContext ? `\nReported error / failure:\n${errorContext}` : '',
    '\nReturn the repaired definition.',
  ].join('\n');
  return generateValidated(env, system, prompt);
}
