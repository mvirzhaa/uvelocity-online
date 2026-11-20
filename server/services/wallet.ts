import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { assert } from './errors.js';
import { MAX_BALANCE } from './validation.js';

export interface Wallet { balance: string; version: string; currency: 'RP_GAME' }
export interface WalletChange { userId: string; delta: bigint; kind: 'starter'|'purchase'|'admin_topup'|'race_reward'|'correction'; eventKey: string; actorId?: string; reason: string }
export async function mutateWallet(client: PoolClient, change: WalletChange): Promise<Wallet & {entryId: string}> {
  assert(change.delta !== 0n, 400, 'INVALID_AMOUNT', 'Perubahan saldo tidak boleh nol.');
  const found = await client.query('SELECT balance,version FROM wallets WHERE user_id=$1 FOR UPDATE', [change.userId]);
  assert(found.rowCount, 404, 'USER_NOT_FOUND', 'Pemain tidak ditemukan.');
  const duplicate = await client.query('SELECT id,delta,balance_after,wallet_version,user_id FROM wallet_entries WHERE event_key=$1', [change.eventKey]);
  if (duplicate.rowCount) {
    const entry = duplicate.rows[0];
    assert(entry.user_id === change.userId && entry.delta === change.delta.toString(), 409, 'EVENT_CONFLICT', 'Referensi transaksi sudah digunakan.');
    return {entryId:entry.id,balance:entry.balance_after,version:entry.wallet_version,currency:'RP_GAME'};
  }
  const next = BigInt(found.rows[0].balance) + change.delta;
  assert(next >= 0n, 409, 'INSUFFICIENT_BALANCE', 'Kredit game tidak mencukupi.');
  assert(next <= MAX_BALANCE, 409, 'BALANCE_LIMIT', 'Saldo melampaui batas akun.');
  const updated = await client.query('UPDATE wallets SET balance=$2,version=version+1 WHERE user_id=$1 RETURNING balance,version', [change.userId,next.toString()]);
  const wallet = updated.rows[0], entryId = randomUUID();
  await client.query('INSERT INTO wallet_entries(id,user_id,delta,balance_after,wallet_version,kind,event_key,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [entryId,change.userId,change.delta.toString(),wallet.balance,wallet.version,change.kind,change.eventKey,change.actorId ?? null,change.reason]);
  return {entryId,balance:wallet.balance,version:wallet.version,currency:'RP_GAME'};
}
