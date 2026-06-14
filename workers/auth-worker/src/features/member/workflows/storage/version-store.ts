import { executeUtils } from '../../../../shared/utils.js';
import type { UserDO } from '../../../ws/infrastructure/UserDO.js';
import type { WorkflowVersion } from '../domain/domain.js';

/**
 * Persistence helpers for workflow version snapshots. Records live in the
 * owner's UserDO and provide a lightweight history / restore mechanism for the
 * marketplace (publish creates a snapshot; users can roll back to any version).
 */

export type VersionRow = WorkflowVersion & { id: number; createdAt?: number };

export async function listVersions(
  userDO: DurableObjectStub<UserDO>,
  workflowId: number,
  limit = 50,
): Promise<VersionRow[]> {
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    {
      where: { field: 'workflowId', operator: '=', value: workflowId },
      orderBy: { field: 'version', direction: 'DESC' },
      limit,
    },
    'workflow_versions',
  );
  return Array.isArray(rows) ? (rows as VersionRow[]) : [];
}

export async function getVersionByKey(
  userDO: DurableObjectStub<UserDO>,
  versionKey: string,
): Promise<VersionRow | null> {
  const rows = await executeUtils.executeDynamicAction(
    userDO,
    'select',
    { where: { field: 'versionKey', operator: '=', value: versionKey } },
    'workflow_versions',
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return (row as VersionRow) ?? null;
}

async function nextVersionNumber(
  userDO: DurableObjectStub<UserDO>,
  workflowId: number,
): Promise<number> {
  const rows = await listVersions(userDO, workflowId, 1);
  const latest = rows[0]?.version ?? 0;
  return latest + 1;
}

export interface SnapshotInput {
  workflowId: number;
  definition: string;
  label?: string;
  note?: string;
  reason?: 'manual' | 'publish';
}

export async function snapshotVersion(
  userDO: DurableObjectStub<UserDO>,
  data: SnapshotInput,
): Promise<VersionRow> {
  const version = await nextVersionNumber(userDO, data.workflowId);
  const created = await executeUtils.executeDynamicAction(
    userDO,
    'insert',
    {
      versionKey: crypto.randomUUID(),
      workflowId: data.workflowId,
      version,
      label: data.label ?? `v${version}`,
      note: data.note ?? '',
      definition: data.definition,
      reason: data.reason ?? 'manual',
    },
    'workflow_versions',
  );
  return created as VersionRow;
}
