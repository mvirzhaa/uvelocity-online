import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from '../db/pool.js';
import { CAR_IDS } from '../../shared/types.js';
import { TUNING_BOUNDS } from './economy.js';
import { assert } from './errors.js';
import { idempotent } from './idempotency.js';
import { mutateWallet } from './wallet.js';
import * as v from './validation.js';

export async function requireAdmin(db: Pool|PoolClient, actorId: string): Promise<void> {
  const found=await db.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actorId]);
  assert(found.rowCount,403,'ADMIN_REQUIRED','Akses administrator diperlukan.');
}
async function audit(client:PoolClient,actorId:string,action:string,targetId:string,reason:string,before:unknown,after:unknown):Promise<void> {
  await client.query('INSERT INTO admin_audit(id,actor_id,action,target_id,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[randomUUID(),actorId,action,targetId,reason,before===null?null:JSON.stringify(before),JSON.stringify(after)]);
}
function moneyAllowZero(value:unknown,max=1_000_000_000_000n):string {
  assert(typeof value==='string' && /^(0|[1-9][0-9]{0,15})$/.test(value) && BigInt(value)<=max,400,'INVALID_AMOUNT','Jumlah harus berupa string bilangan bulat dalam batas yang diizinkan.');
  return value;
}
function expectedVersion(value:unknown):number {
  const num=typeof value==='string'&&/^[1-9][0-9]{0,8}$/.test(value)?Number(value):value;
  return v.integer(num,'Versi sebelumnya',1,2_147_483_647);
}
function bounded(value:unknown,field:keyof typeof TUNING_BOUNDS):number {
  const bounds=TUNING_BOUNDS[field];
  assert(typeof value==='number'&&Number.isFinite(value)&&value>=bounds.min&&value<=bounds.max,400,'INVALID_TUNING',`${field} harus berada dalam rentang ${bounds.min}–${bounds.max}.`);
  const digits=field==='handling'?3:2;
  return Math.round(value*10**digits)/10**digits;
}
function rewardPolicy(value:unknown) {
  const input=v.object(value);
  assert(Array.isArray(input.podium)&&input.podium.length===3,400,'INVALID_REWARDS','Bonus podium harus terdiri dari tiga jumlah.');
  return {version:1,finish:moneyAllowZero(input.finish,100_000n),perLap:moneyAllowZero(input.perLap,10_000n),podium:input.podium.map(n=>moneyAllowZero(n,100_000n)),
    minimumDurationMs:v.integer(input.minimumDurationMs,'Durasi minimum',15000,300000),maximum:moneyAllowZero(input.maximum,500_000n)};
}

export class AdminService {
  constructor(public readonly pool:Pool){}

  async listUsers(actorId:string,rawQuery:unknown='',rawLimit:unknown=30) {
    await requireAdmin(this.pool,actorId);
    const query=typeof rawQuery==='string'?rawQuery.trim():'';
    assert(query.length<=254,400,'INVALID_QUERY','Pencarian terlalu panjang.');
    const limit=v.integer(typeof rawLimit==='string'?Number(rawLimit):rawLimit,'Limit',1,100);
    const result=await this.pool.query(`SELECT u.id,u.id AS "userId",u.email,u.display_name AS "displayName",u.avatar_id AS "avatarId",u.role,
      CASE WHEN u.disabled THEN 'disabled' ELSE 'active' END AS status,w.balance,w.version AS "walletVersion",u.created_at AS "createdAt"
      FROM users u JOIN wallets w ON w.user_id=u.id
      WHERE $1='' OR strpos(lower(u.email),lower($1))>0 OR strpos(lower(u.display_name),lower($1))>0 OR u.id::text=$1
      ORDER BY u.created_at DESC,u.id LIMIT $2`,[query,limit]);
    return {users:result.rows};
  }

  async getAudit(actorId:string,rawLimit:unknown=50) {
    await requireAdmin(this.pool,actorId);
    const limit=v.integer(typeof rawLimit==='string'?Number(rawLimit):rawLimit,'Limit',1,100);
    const result=await this.pool.query(`SELECT a.id,a.actor_id AS "actorId",u.display_name AS "actorName",a.action,a.target_id AS "targetId",a.reason,
      a.before_data AS before,a.after_data AS after,a.created_at AS "createdAt"
      FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id DESC LIMIT $1`,[limit]);
    return {entries:result.rows};
  }

  async topup(actorId:string,input:unknown,key:unknown) {
    const body=v.object(input),userId=v.uuid(body.userId,'Pemain'),amount=v.amount(body.amount),reference=v.text(body.reference,'Referensi',8,100),reason=v.text(body.reason,'Alasan',4,500);
    return transaction(this.pool,async client=>{
      await requireAdmin(client,actorId);
      return idempotent(client,actorId,'admin.topup',key,{userId,amount:amount.toString(),reference,reason},async()=>{
        // The reference identifies the grant itself across retries, browsers, and administrators.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`topup:${reference}`]);
        const previous=await client.query('SELECT id,user_id,delta,balance_after,wallet_version,reason FROM wallet_entries WHERE event_key=$1',[`admin_topup:${reference}`]);
        if (previous.rowCount) {
          const old=previous.rows[0];
          assert(old.user_id===userId&&old.delta===amount.toString()&&old.reason===reason,409,'REFERENCE_CONFLICT','Referensi top-up sudah digunakan untuk kredit yang berbeda.');
          return {entryId:old.id,userId,amount:old.delta,reference,alreadyApplied:true,wallet:{balance:old.balance_after,version:old.wallet_version,currency:'RP_GAME'}};
        }
        const before=await client.query('SELECT balance,version FROM wallets WHERE user_id=$1 FOR UPDATE',[userId]);
        assert(before.rowCount,404,'USER_NOT_FOUND','Pemain tidak ditemukan.');
        const wallet=await mutateWallet(client,{userId,delta:amount,kind:'admin_topup',eventKey:`admin_topup:${reference}`,actorId,reason});
        await audit(client,actorId,'wallet.topup',userId,reason,before.rows[0],{balance:wallet.balance,version:wallet.version,amount:amount.toString(),reference,entryId:wallet.entryId});
        return {entryId:wallet.entryId,userId,amount:amount.toString(),reference,alreadyApplied:false,wallet:{balance:wallet.balance,version:wallet.version,currency:'RP_GAME'}};
      });
    });
  }

  async updateCatalog(actorId:string,itemId:string,input:unknown) {
    const body=v.object(input),version=expectedVersion(body.expectedVersion),reason=v.text(body.reason,'Alasan',4,500);
    assert(body.price!==undefined||body.enabled!==undefined,400,'NO_CHANGES','Pilih harga atau status item yang ingin diubah.');
    const price=body.price===undefined?null:moneyAllowZero(body.price);
    assert(body.enabled===undefined||typeof body.enabled==='boolean',400,'INVALID_ENABLED','Status harus berupa boolean.');
    return transaction(this.pool,async client=>{
      await requireAdmin(client,actorId);
      const found=await client.query('SELECT * FROM catalog_items WHERE id=$1 FOR UPDATE',[itemId]);
      assert(found.rowCount,404,'ITEM_NOT_FOUND','Item tidak ditemukan.');
      assert(found.rows[0].version===version,409,'CATALOG_CHANGED','Item telah diubah admin lain. Muat ulang sebelum menyimpan.');
      const result=await client.query('UPDATE catalog_items SET price=COALESCE($2,price),active=COALESCE($3,active),version=version+1 WHERE id=$1 RETURNING id,kind,name,price,active AS enabled,version AS "catalogVersion"',[itemId,price,body.enabled??null]);
      const updated=result.rows[0];
      await audit(client,actorId,'catalog.updated',itemId,reason,{price:found.rows[0].price,enabled:found.rows[0].active,catalogVersion:version},updated);
      return {item:updated};
    });
  }

  async getTuning(actorId:string) {
    await requireAdmin(this.pool,actorId);
    const result=await this.pool.query('SELECT r.*,a.active_ruleset_id FROM app_state a JOIN rulesets r ON r.id=a.active_ruleset_id WHERE a.singleton=true');
    const row=result.rows[0],cars=await this.pool.query('SELECT car_id AS "carId",top_speed AS "topSpeed",zero_to_100 AS "zeroTo100",handling FROM ruleset_cars WHERE ruleset_id=$1 ORDER BY car_id',[row.id]);
    return {version:String(row.version),bounds:TUNING_BOUNDS,physics:row.physics,rewardPolicy:row.reward_policy,cars:cars.rows.map(c=>({...c,topSpeed:Number(c.topSpeed),zeroTo100:Number(c.zeroTo100),handling:Number(c.handling)}))};
  }

  async publishTuning(actorId:string,input:unknown) {
    const body=v.object(input),version=expectedVersion(body.expectedVersion),reason=v.text(body.reason,'Alasan',4,500);
    let change:{carId:string;topSpeed:number;zeroTo100:number;handling:number}|null=null;
    if (body.carId!==undefined) {
      assert(typeof body.carId==='string'&&(CAR_IDS as readonly string[]).includes(body.carId),400,'INVALID_CAR','Mobil tidak tersedia.');
      change={carId:body.carId,topSpeed:bounded(body.topSpeed,'topSpeed'),zeroTo100:bounded(body.zeroTo100,'zeroTo100'),handling:bounded(body.handling,'handling')};
    }
    const rewards=body.rewardPolicy===undefined?null:rewardPolicy(body.rewardPolicy);
    assert(change||rewards,400,'NO_CHANGES','Tidak ada perubahan aturan.');
    return transaction(this.pool,async client=>{
      await requireAdmin(client,actorId);
      const active=await client.query('SELECT r.* FROM app_state a JOIN rulesets r ON r.id=a.active_ruleset_id WHERE a.singleton=true FOR UPDATE OF a');
      const old=active.rows[0];
      assert(old.version===version,409,'RULESET_CHANGED','Aturan telah diterbitkan admin lain. Muat ulang sebelum menyimpan.');
      const next=await client.query('INSERT INTO rulesets(version,physics_version,physics,reward_policy,created_by,reason) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6) RETURNING id,version',[version+1,old.physics_version,JSON.stringify(old.physics),JSON.stringify(rewards??old.reward_policy),actorId,reason]);
      const nextRow=next.rows[0];
      await client.query('INSERT INTO ruleset_cars(ruleset_id,car_id,top_speed,zero_to_100,handling) SELECT $1,car_id,CASE WHEN car_id=$3 THEN $4::numeric ELSE top_speed END,CASE WHEN car_id=$3 THEN $5::numeric ELSE zero_to_100 END,CASE WHEN car_id=$3 THEN $6::numeric ELSE handling END FROM ruleset_cars WHERE ruleset_id=$2',[nextRow.id,old.id,change?.carId??null,change?.topSpeed??null,change?.zeroTo100??null,change?.handling??null]);
      await client.query('UPDATE app_state SET active_ruleset_id=$1 WHERE singleton=true',[nextRow.id]);
      await audit(client,actorId,'ruleset.published',String(nextRow.version),reason,{version:String(version)}, {version:String(nextRow.version),car:change,rewardPolicy:rewards??old.reward_policy,appliesTo:'new-races'});
      return {version:String(nextRow.version),previousVersion:String(version),appliesTo:'new-races',car:change,rewardPolicy:rewards??old.reward_policy};
    });
  }
}

export function createAdminService(pool:Pool):AdminService{return new AdminService(pool);}
