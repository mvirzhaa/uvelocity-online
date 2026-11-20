import { createHash } from 'node:crypto';
import { assert } from './errors.js';

export const MAX_BALANCE = 1_000_000_000_000_000n;
export function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_BODY', 'Permintaan harus berupa objek JSON.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string, min: number, max: number): string {
  assert(typeof value === 'string', 400, 'INVALID_FIELD', `${field} harus berupa teks.`);
  const result = value.trim();
  const length = Array.from(result).length;
  assert(length >= min && length <= max && !/[\u0000-\u001f\u007f]/u.test(result), 400, 'INVALID_FIELD', `${field} harus berisi ${min}–${max} karakter.`);
  return result;
}
export function email(value: unknown): string {
  const result = text(value, 'Email', 3, 254).toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result), 400, 'INVALID_EMAIL', 'Alamat email tidak valid.');
  return result;
}
export function password(value: unknown): string {
  assert(typeof value === 'string' && value.length >= 12 && value.length <= 128, 400, 'INVALID_PASSWORD', 'Kata sandi harus berisi 12–128 karakter.');
  return value;
}
export function uuid(value: unknown, field = 'ID'): string {
  assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 400, 'INVALID_ID', `${field} tidak valid.`);
  return value.toLowerCase();
}
export function integer(value: unknown, field: string, min: number, max: number): number {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, 400, 'INVALID_NUMBER', `${field} harus berupa bilangan bulat ${min}–${max}.`);
  return value;
}
export function amount(value: unknown, max = 1_000_000_000_000n): bigint {
  assert(typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value), 400, 'INVALID_AMOUNT', 'Jumlah kredit harus berupa string bilangan bulat positif.');
  const result = BigInt(value);
  assert(result <= max, 400, 'INVALID_AMOUNT', 'Jumlah kredit melebihi batas transaksi.');
  return result;
}
export function color(value: unknown): string {
  assert(typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value), 400, 'INVALID_COLOR', 'Warna harus berupa #RRGGBB.');
  return value.toLowerCase();
}
export function finish(value: unknown): 'metallic'|'gloss'|'matte' {
  assert(value === 'metallic' || value === 'gloss' || value === 'matte', 400, 'INVALID_FINISH', 'Finish kendaraan tidak valid.');
  return value;
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value as object).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
}
export function fingerprint(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
