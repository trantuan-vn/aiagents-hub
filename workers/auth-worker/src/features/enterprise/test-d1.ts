import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ENTERPRISE_MIGRATIONS = ['019_enterprise.sql', '021_enterprise_flag_request_one_pending.sql'];

/** In-memory SQLite with the real enterprise migrations, for tests only. */
export function enterpriseSqlite(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ENTERPRISE_MIGRATIONS) {
    sqlite.exec(readFileSync(new URL(`../../../../queue-worker/migrations/${f}`, import.meta.url), 'utf8'));
  }
  return sqlite;
}

/** The slice of the D1 API the enterprise module uses, over node:sqlite. */
export function fakeD1(sqlite: DatabaseSync): D1Database {
  const statement = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    bind: (...next: unknown[]) => statement(sql, next),
    run: async () => {
      const r = sqlite.prepare(sql).run(...(params as any[]));
      return { results: [], meta: { changes: Number(r.changes) } };
    },
    first: async () => sqlite.prepare(sql).get(...(params as any[])) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...(params as any[])) }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (stmts: any[]) => {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(/^\s*SELECT/i.test(s.sql) ? await s.all() : await s.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  } as unknown as D1Database;
}
