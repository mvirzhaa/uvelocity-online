import type { PoolClient } from 'pg';
import { assert } from './errors.js';
import { fingerprint, text } from './validation.js';

export async function idempotent<T>(client: PoolClient, actorId: string, operation: string, rawKey: unknown, payload: unknown, perform: () => Promise<T>): Promise<T> {
  const key = text(rawKey, 'Idempotency-Key', 8, 128), hash = fingerprint(payload);
  const inserted = await client.query('INSERT INTO idempotency_requests(actor_id,operation,key,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key', [actorId,operation,key,hash]);
  if (!inserted.rowCount) {
    const existing = await client.query('SELECT request_hash,response FROM idempotency_requests WHERE actor_id=$1 AND operation=$2 AND key=$3 FOR UPDATE', [actorId,operation,key]);
    assert(existing.rows[0]?.request_hash === hash, 409, 'IDEMPOTENCY_CONFLICT', 'Kunci operasi telah digunakan untuk permintaan yang berbeda.');
    assert(existing.rows[0]?.response !== null, 409, 'OPERATION_PENDING', 'Operasi sedang diproses. Coba lagi dengan kunci yang sama.');
    return existing.rows[0].response as T;
  }
  const response = await perform();
  await client.query('UPDATE idempotency_requests SET response=$4::jsonb WHERE actor_id=$1 AND operation=$2 AND key=$3', [actorId,operation,key,JSON.stringify(response)]);
  return response;
}
