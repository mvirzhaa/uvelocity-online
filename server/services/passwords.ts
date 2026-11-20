import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ServiceError } from './errors.js';

// OWASP Password Storage Cheat Sheet: scrypt N=2^17, r=8, p=1 (128 MiB).
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const COST = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let active=0;
const waiting:Array<(release:()=>void)=>void>=[];
function release():void {const next=waiting.shift();if(next)next(release);else active--;}
function acquire():Promise<()=>void> {
  if(active<2){active++;return Promise.resolve(release);}
  if(waiting.length>=16)return Promise.reject(new ServiceError(429,'AUTH_BUSY','Layanan masuk sedang sibuk. Coba lagi sebentar.'));
  return new Promise(resolve=>waiting.push(resolve));
}
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  const free=await acquire();
  try {return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, COST, (error, key) => error ? reject(error) : resolve(key)));}
  finally {free();}
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1') return false;
  const salt = Buffer.from(parts[4]!, 'base64url'), expected = Buffer.from(parts[5]!, 'base64url');
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
// A failed unknown-account login performs the same expensive derivation.
export async function dummyPasswordCheck(password: string): Promise<void> { await derive(password, Buffer.alloc(16)); }
