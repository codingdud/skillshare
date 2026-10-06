import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../config.js';
const local = config.DATABASE_URL.startsWith('pglite://');
if (local && config.NODE_ENV === 'production')
  throw new Error('Production requires a PostgreSQL server.');
const embedded = local ? new PGlite(config.DATABASE_URL.slice('pglite://'.length)) : null;
const postgres = local
  ? null
  : new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const task = queue.then(fn);
  queue = task.catch(() => undefined);
  return task;
}
function adapter(db: Pick<PGlite, 'query' | 'exec'>): DB {
  return {
    query: (async (sql: string, params?: unknown[]) => {
      const result = params ? await db.query(sql, params) : (await db.exec(sql)).at(-1);
      return {
        rows: result?.rows ?? [],
        rowCount: result?.affectedRows ?? result?.rows.length ?? 0,
      };
    }) as DB['query'],
  };
}
export const pool = {
  query: (postgres
    ? postgres.query.bind(postgres)
    : (sql: string, params?: unknown[]) =>
        serialized(() => adapter(embedded!).query(sql, params))) as DB['query'],
  async end() {
    if (postgres) await postgres.end();
    if (embedded) await embedded.close();
  },
};
export type DB = Pick<pg.PoolClient, 'query'>;
export async function transaction<T>(work: (db: DB) => Promise<T>): Promise<T> {
  if (embedded) return serialized(() => embedded.transaction((tx) => work(adapter(tx))));
  const client = await postgres!.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
