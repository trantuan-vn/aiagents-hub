import {
  WORKFLOW_NODE_CATALOG_SEEDS,
  defaultIsActive,
  type WorkflowCatalogEntry,
  type WorkflowCatalogEntrySeed,
} from '@aiagents-hub/workflow-nodes';

export type { WorkflowCatalogEntry, WorkflowCatalogEntrySeed };

export function seedToRow(seed: WorkflowCatalogEntrySeed, now = Date.now()) {
  const isActive = defaultIsActive(seed) ? 1 : 0;
  return {
    id: seed.id,
    add_category: seed.addCategory,
    runtime_type: seed.runtimeType,
    kind: seed.kind ?? null,
    name_key: seed.nameKey,
    desc_key: seed.descKey,
    has_backend: seed.hasBackend ? 1 : 0,
    has_frontend: seed.hasFrontend ? 1 : 0,
    is_active: isActive,
    sort_order: seed.sortOrder ?? 0,
    updated_at: now,
  };
}

type CatalogRow = ReturnType<typeof seedToRow>;

function rowToEntry(row: CatalogRow): WorkflowCatalogEntry {
  return {
    id: row.id,
    addCategory: row.add_category as WorkflowCatalogEntry['addCategory'],
    runtimeType: row.runtime_type,
    kind: row.kind ?? undefined,
    nameKey: row.name_key,
    descKey: row.desc_key,
    hasBackend: row.has_backend === 1,
    hasFrontend: row.has_frontend === 1,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

export async function ensureWorkflowNodeCatalogSeeded(db: D1Database): Promise<void> {
  const count = await db
    .prepare('SELECT COUNT(*) AS c FROM workflow_node_catalog')
    .first<{ c: number }>();
  if ((count?.c ?? 0) > 0) return;

  const now = Date.now();
  const stmts = WORKFLOW_NODE_CATALOG_SEEDS.map((seed) => {
    const row = seedToRow(seed, now);
    return db
      .prepare(
        `INSERT INTO workflow_node_catalog (
          id, add_category, runtime_type, kind, name_key, desc_key,
          has_backend, has_frontend, is_active, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.add_category,
        row.runtime_type,
        row.kind,
        row.name_key,
        row.desc_key,
        row.has_backend,
        row.has_frontend,
        row.is_active,
        row.sort_order,
        row.updated_at,
      );
  });
  await db.batch(stmts);
}

export async function listWorkflowNodeCatalog(
  db: D1Database,
  options?: { activeOnly?: boolean },
): Promise<WorkflowCatalogEntry[]> {
  await ensureWorkflowNodeCatalogSeeded(db);
  const query = options?.activeOnly
    ? 'SELECT * FROM workflow_node_catalog WHERE is_active = 1 ORDER BY add_category, sort_order, id'
    : 'SELECT * FROM workflow_node_catalog ORDER BY add_category, sort_order, id';
  const result = await db.prepare(query).all<CatalogRow>();
  return (result.results ?? []).map(rowToEntry);
}

export async function updateWorkflowNodeCatalogActive(
  db: D1Database,
  id: string,
  isActive: boolean,
): Promise<WorkflowCatalogEntry | null> {
  await ensureWorkflowNodeCatalogSeeded(db);
  const now = Date.now();
  await db
    .prepare('UPDATE workflow_node_catalog SET is_active = ?, updated_at = ? WHERE id = ?')
    .bind(isActive ? 1 : 0, now, id)
    .run();
  const row = await db
    .prepare('SELECT * FROM workflow_node_catalog WHERE id = ?')
    .bind(id)
    .first<CatalogRow>();
  return row ? rowToEntry(row) : null;
}

export async function syncWorkflowNodeCatalogFromSeeds(db: D1Database): Promise<number> {
  const now = Date.now();
  let upserted = 0;
  for (const seed of WORKFLOW_NODE_CATALOG_SEEDS) {
    const row = seedToRow(seed, now);
    await db
      .prepare(
        `INSERT INTO workflow_node_catalog (
          id, add_category, runtime_type, kind, name_key, desc_key,
          has_backend, has_frontend, is_active, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          add_category = excluded.add_category,
          runtime_type = excluded.runtime_type,
          kind = excluded.kind,
          name_key = excluded.name_key,
          desc_key = excluded.desc_key,
          has_backend = excluded.has_backend,
          has_frontend = excluded.has_frontend,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`,
      )
      .bind(
        row.id,
        row.add_category,
        row.runtime_type,
        row.kind,
        row.name_key,
        row.desc_key,
        row.has_backend,
        row.has_frontend,
        row.is_active,
        row.sort_order,
        row.updated_at,
      )
      .run();
    upserted += 1;
  }
  return upserted;
}
