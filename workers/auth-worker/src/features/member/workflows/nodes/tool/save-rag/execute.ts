import { embedText, upsertVectors, type VectorizeVectorRecord } from '../../../rag-vector.js';
import { resolveRagResources, toolNodeConfig } from '../shared/rag-context.js';
import { chunkText } from './chunk.js';

export type SaveRagChunkInput = {
  content: string;
  index: number;
};

export type SaveRagInput = {
  content: string;
  documentId?: string;
  source?: string;
  chunks?: SaveRagChunkInput[];
  metadata?: Record<string, string>;
};

export type SaveRagResult = {
  ok: boolean;
  saved: number;
  documentId: string;
  collection: string;
};

export type SaveRagExecuteParams = {
  env: Env;
  definition: import('../../../domain/domain.js').WorkflowDefinition;
  agentId: string;
  input: SaveRagInput;
  embedModel?: string;
  ownerId?: string;
  workflowId?: number;
};

function vectorId(documentId: string, index: number): string {
  return `${documentId}::chunk-${index}`;
}

export async function executeSaveRag(params: SaveRagExecuteParams): Promise<SaveRagResult> {
  const { env, definition, agentId, input } = params;
  const config = toolNodeConfig(definition, agentId, 'save-rag') ?? {};
  const rag = resolveRagResources(definition, agentId, params.embedModel, {
    ownerId: params.ownerId,
    workflowId: params.workflowId,
  });

  const chunkSize = Number(config.chunkSize ?? 800) || 800;
  const chunkOverlap = Number(config.chunkOverlap ?? 120) || 120;
  const documentId = String(input.documentId ?? crypto.randomUUID());
  const source = String(input.source ?? input.metadata?.source ?? documentId);
  const namespace = rag.namespace || input.metadata?.namespace || '';

  const textChunks =
    input.chunks?.length
      ? input.chunks.map((c) => ({ content: c.content, index: c.index }))
      : chunkText(input.content, chunkSize, chunkOverlap);

  if (!textChunks.length) {
    return { ok: false, saved: 0, documentId, collection: rag.collection };
  }

  const vectors: VectorizeVectorRecord[] = [];

  for (const chunk of textChunks) {
    const values = await embedText(env, chunk.content, rag.embedModel);
    if (!values.length) continue;

    const metadata: Record<string, string> = {
      text: chunk.content,
      content: chunk.content,
      source,
      documentId,
      chunkIndex: String(chunk.index),
      ...(namespace ? { namespace } : {}),
      ...(input.metadata ?? {}),
    };

    vectors.push({
      id: vectorId(documentId, chunk.index),
      values,
      metadata,
    });
  }

  const saved = await upsertVectors(env, rag.collection, vectors);
  return { ok: saved > 0, saved, documentId, collection: rag.collection };
}
