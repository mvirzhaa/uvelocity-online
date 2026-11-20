import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import { transaction } from '../db/pool.js';
import { assert, isPgError, ServiceError } from './errors.js';
import { dummyPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { mutateWallet } from './wallet.js';
import * as v from './validation.js';

export const SESSION_COOKIE = 'uv_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const AVATAR_IDS=['driver-1','driver-2','driver-3','driver-4','driver-5','driver-6'] as const;
export interface PublicUser { id: string; email: string; displayName: string; avatarId: string; role: 'player'|'admin'; createdAt: string }
export interface AuthSession extends PublicUser { csrfToken: string; sessionHash: string; expiresAt: string }
export interface AuthResult { user: PublicUser; sessionToken: string; csrfToken: string; expiresAt: string }
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function sessionTokenFromHeaders(headers: IncomingHttpHeaders): string | null {
  const values = (headers.cookie ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(SESSION_COOKIE + '='));
  if (values.length !== 1) return null;
  const token = values[0]!.slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function publicUser(row: Record<string, any>): PublicUser {
  return { id:row.id, email:row.email, displayName:row.display_name, avatarId:row.avatar_id, role:row.role, createdAt:new Date(row.created_at).toISOString() };
}
export function verifyCsrf(session: AuthSession, candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length !== session.csrfToken.length) return false;
  const actual = Buffer.from(candidate), expected = Buffer.from(session.csrfToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class AccountService {
  constructor(public readonly pool: Pool) {}

  async throttle(scope: string, identifier: string, limit: number): Promise<void> {
    const bucket = tokenHash(scope + '\0' + identifier);
    const result = await this.pool.query(`INSERT INTO auth_throttle(bucket,attempts) VALUES($1,1)
      ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN auth_throttle.window_started_at < now()-interval '15 minutes' THEN 1 ELSE auth_throttle.attempts+1 END,
      window_started_at=CASE WHEN auth_throttle.window_started_at < now()-interval '15 minutes' THEN now() ELSE auth_throttle.window_started_at END
      RETURNING attempts`, [bucket]);
    assert(result.rows[0].attempts <= limit, 429, 'TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
  }

  async register(input: unknown): Promise<AuthResult> {
    const body = v.object(input), email = v.email(body.email), displayName = v.text(body.displayName, 'Nama profil', 2, 32), password = v.password(body.password);
    const passwordHash = await hashPassword(password);
    try {
      return await transaction(this.pool, async client => {
        const user = await this.insertUser(client, email, displayName, passwordHash, 'player');
        return this.createSession(client, user);
      });
    } catch (error) {
      if (isPgError(error,'23505')) throw new ServiceError(409,'EMAIL_IN_USE','Alamat email sudah terdaftar.');
      throw error;
    }
  }

  private async insertUser(client: PoolClient, email: string, displayName: string, passwordHash: string, role: 'player'|'admin'): Promise<PublicUser> {
    const id = randomUUID();
    const inserted = await client.query('INSERT INTO users(id,email,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING *', [id,email,displayName,passwordHash,role]);
    await client.query('INSERT INTO wallets(user_id) VALUES($1)', [id]);
    await mutateWallet(client, {userId:id,delta:25000n,kind:'starter',eventKey:`starter:${id}`,reason:'Kredit awal virtual UVelocity'});
    await client.query("INSERT INTO user_items(user_id,item_id,source) VALUES($1,'brz','starter'),($1,'stock','starter')", [id]);
    await client.query("INSERT INTO loadouts(user_id,car_item_id,wheel_item_id,color,finish) VALUES($1,'brz','stock','#2866b8','metallic')", [id]);
    return publicUser(inserted.rows[0]);
  }

  async createAdmin(input: unknown): Promise<PublicUser> {
    const body=v.object(input), email=v.email(body.email), displayName=v.text(body.displayName,'Nama admin',2,32), password=v.password(body.password);
    const passwordHash=await hashPassword(password);
    return transaction(this.pool, async client => {
      const existing=await client.query('SELECT id FROM users WHERE email=$1',[email]);
      assert(!existing.rowCount,409,'EMAIL_IN_USE','Email sudah terdaftar. Perintah ini tidak mengganti role atau password akun yang ada.');
      const user=await this.insertUser(client,email,displayName,passwordHash,'admin');
      await client.query('INSERT INTO admin_audit(id,actor_id,action,target_id,reason,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),user.id,'admin.created',user.id,'Administrator created by explicit local operator command',JSON.stringify({email,displayName,role:'admin'})]);
      return user;
    });
  }

  async login(input: unknown): Promise<AuthResult> {
    const body=v.object(input), email=v.email(body.email);
    assert(typeof body.password==='string' && body.password.length>=1 && body.password.length<=128,401,'INVALID_CREDENTIALS','Email atau kata sandi salah.');
    await this.throttle('login-account',email,20);
    const result=await this.pool.query('SELECT * FROM users WHERE email=$1',[email]);
    const row=result.rows[0];
    if (!row) { await dummyPasswordCheck(body.password); throw new ServiceError(401,'INVALID_CREDENTIALS','Email atau kata sandi salah.'); }
    const valid=await verifyPassword(body.password,row.password_hash);
    assert(valid && !row.disabled,401,'INVALID_CREDENTIALS','Email atau kata sandi salah.');
    return transaction(this.pool, client => this.createSession(client,publicUser(row)));
  }

  private async createSession(client: PoolClient, user: PublicUser): Promise<AuthResult> {
    const sessionToken=randomBytes(32).toString('base64url'),csrfToken=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+SESSION_MS).toISOString();
    await client.query('DELETE FROM sessions WHERE user_id=$1 AND expires_at<=now()',[user.id]);
    await client.query('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)',[tokenHash(sessionToken),user.id,csrfToken,expiresAt]);
    return {user,sessionToken,csrfToken,expiresAt};
  }

  async authenticateSession(headers: IncomingHttpHeaders): Promise<AuthSession|null> {
    const token=sessionTokenFromHeaders(headers);
    if (!token) return null;
    const result=await this.pool.query(`SELECT u.*,s.csrf_token,s.token_hash,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled`,[tokenHash(token)]);
    if (!result.rowCount) return null;
    const row=result.rows[0];
    return {...publicUser(row),csrfToken:row.csrf_token,sessionHash:row.token_hash,expiresAt:new Date(row.expires_at).toISOString()};
  }

  async logout(headers: IncomingHttpHeaders): Promise<void> {
    const token=sessionTokenFromHeaders(headers);
    if (token) await this.pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);
  }

  async updateProfile(userId: string, input: unknown): Promise<{user:PublicUser}> {
    const body=v.object(input);
    assert(body.displayName!==undefined || body.avatarId!==undefined,400,'NO_CHANGES','Pilih nama profil atau avatar yang ingin diubah.');
    const displayName=body.displayName===undefined?null:v.text(body.displayName,'Nama profil',2,32);
    const avatarId=body.avatarId===undefined?null:v.text(body.avatarId,'Avatar',1,20);
    assert(avatarId===null || (AVATAR_IDS as readonly string[]).includes(avatarId),400,'INVALID_AVATAR','Avatar tidak tersedia.');
    const result=await this.pool.query('UPDATE users SET display_name=COALESCE($2,display_name),avatar_id=COALESCE($3,avatar_id) WHERE id=$1 AND NOT disabled RETURNING *',[userId,displayName,avatarId]);
    assert(result.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');
    return {user:publicUser(result.rows[0])};
  }

  async issueRaceTicket(session: AuthSession): Promise<{ticket:string;expiresAt:string}> {
    await this.throttle('race-ticket',session.sessionHash,120);
    const ticket=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+60_000).toISOString();
    await this.pool.query('DELETE FROM race_tickets WHERE expires_at<=now()');
    await this.pool.query('INSERT INTO race_tickets(token_hash,session_hash,expires_at) VALUES($1,$2,$3)',[tokenHash(ticket),session.sessionHash,expiresAt]);
    return {ticket,expiresAt};
  }

  async consumeRaceTicket(input: {ticket:unknown;headers:IncomingHttpHeaders}): Promise<Pick<PublicUser,'id'|'displayName'|'role'>|null> {
    const sessionToken=sessionTokenFromHeaders(input.headers);
    if (typeof input.ticket!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.ticket) || !sessionToken) return null;
    const result=await this.pool.query(`DELETE FROM race_tickets t USING sessions s,users u
      WHERE t.token_hash=$1 AND t.session_hash=s.token_hash AND s.token_hash=$2 AND s.user_id=u.id
      AND t.expires_at>now() AND s.expires_at>now() AND NOT u.disabled RETURNING u.id,u.display_name,u.role`,[tokenHash(input.ticket),tokenHash(sessionToken)]);
    const row=result.rows[0];
    return row?{id:row.id,displayName:row.display_name,role:row.role}:null;
  }
}

export function createAccountService(pool: Pool): AccountService { return new AccountService(pool); }
