import pg from 'pg';
import type { PoolClient } from 'pg';

export type Database = pg.Pool;
export type Transaction = PoolClient;

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL is required. PostgreSQL is the only supported persistence store.');
  return new pg.Pool({ connectionString, max: 12, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

export async function transaction<T>(pool: pg.Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (error as { code?: string }).code;
      if (attempt < 2 && (code === '40001' || code === '40P01')) continue;
      throw error;
    } finally { client.release(); }
  }
}
