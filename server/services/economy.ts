import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { CAR_IDS, CIRCUIT_IDS } from '../../shared/types.js';
import {RECONSTRUCTED_CAR_IDS} from '../../shared/catalog.js';
import type { BeginRaceInput, CarId, FrozenLoadout, LoadoutSelection, RaceResult, RaceRuleset, RaceSettlement, VehicleStats } from '../../shared/types.js';
import { transaction } from '../db/pool.js';
import { assert } from './errors.js';
import { idempotent } from './idempotency.js';
import { mutateWallet } from './wallet.js';
import {AppearanceService} from './appearance.js';
export {WHEEL_IDS} from './appearance.js';
import * as v from './validation.js';

type Queryable = Pool | PoolClient;
interface RulesetRecord extends RaceRuleset { databaseId: string; rewardPolicy: RewardPolicy }
interface RewardPolicy { version:number; finish:string; perLap:string; podium:string[]; minimumDurationMs:number; maximum:string }
export const TUNING_BOUNDS = Object.freeze({topSpeed:{min:120,max:450},zeroTo100:{min:1.8,max:15},handling:{min:.6,max:1.6}});
function versionNumber(value: unknown): number {
  assert(typeof value==='string' && /^[1-9][0-9]{0,8}$/.test(value),400,'INVALID_VERSION','Versi aturan tidak valid.');
  return Number(value);
}
async function readRuleset(db: Queryable, version?: string): Promise<RulesetRecord> {
  const result=version===undefined
    ? await db.query('SELECT r.* FROM rulesets r JOIN app_state a ON a.active_ruleset_id=r.id WHERE a.singleton=true')
    : await db.query('SELECT * FROM rulesets WHERE version=$1',[versionNumber(version)]);
  assert(result.rowCount,404,'RULESET_NOT_FOUND','Versi aturan tidak ditemukan.');
  const row=result.rows[0],carRows=await db.query('SELECT car_id,top_speed,zero_to_100,handling FROM ruleset_cars WHERE ruleset_id=$1',[row.id]);
  const cars=Object.fromEntries(carRows.rows.map(c=>[c.car_id,{topSpeed:Number(c.top_speed),zeroTo100:Number(c.zero_to_100),handling:Number(c.handling)}])) as Record<CarId,VehicleStats>;
  if(version===undefined)assert(CAR_IDS.every(id=>cars[id]),503,'INCOMPLETE_RULESET','Katalog performa belum lengkap.');
  return {databaseId:row.id,version:String(row.version),cars,physics:row.physics,rewardPolicy:row.reward_policy};
}

export class EconomyService {
  readonly appearances:AppearanceService;
  constructor(public readonly pool: Pool) {this.appearances=new AppearanceService(pool);}

  async getActiveRuleset(): Promise<RaceRuleset> {
    const {databaseId:_,...ruleset}=await readRuleset(this.pool);
    return ruleset;
  }

  async getCatalog() {
    const ruleset=await this.getActiveRuleset(),result=await this.pool.query('SELECT * FROM catalog_items ORDER BY kind,price,id');
    const items=result.rows.map(row=>({id:row.id,itemId:row.id,kind:row.kind,name:row.name,price:row.price,catalogVersion:row.version,enabled:row.active,...row.metadata,...(row.kind==='car'?{locked:row.locked}:{}),
      ...(row.kind==='car'?{stats:ruleset.cars[row.id as CarId],...ruleset.cars[row.id as CarId],tuningVersion:ruleset.version}:{cosmeticOnly:true}),
      ...(RECONSTRUCTED_CAR_IDS.includes(row.id)?{modelOrigin:'reference-reconstruction',modelNote:'Rekonstruksi 3D berdasarkan referensi'}:{})}));
    return {currency:'RP_GAME',currencyLabel:'Rp · kredit game',rulesetVersion:ruleset.version,tuningBounds:TUNING_BOUNDS,cars:items.filter(x=>x.kind==='car'),wheels:items.filter(x=>x.kind==='wheel'),services:items.filter(x=>x.kind==='service'),stripes:items.filter(x=>x.kind==='service'&&x.service==='stripe-install')};
  }

  async getProfile(userId: string) {
    const loadout=await this.appearances.activeLoadout(userId);
    const [user,wallet,items,stats,appearances]=await Promise.all([
      this.pool.query('SELECT id,email,display_name,avatar_id,role,created_at FROM users WHERE id=$1 AND NOT disabled',[userId]),
      this.pool.query('SELECT balance,version FROM wallets WHERE user_id=$1',[userId]),
      this.pool.query('SELECT i.item_id,c.kind,i.acquired_at FROM user_items i JOIN catalog_items c ON c.id=i.item_id WHERE user_id=$1 ORDER BY c.kind,i.item_id',[userId]),
      this.pool.query("SELECT count(*)::int AS races,count(*) FILTER(WHERE status='finished' AND position=1)::int AS wins,COALESCE(sum(reward),0)::text AS rewards FROM race_results WHERE user_id=$1",[userId]),
      this.appearances.list(userId)
    ]);
    assert(user.rowCount && wallet.rowCount,404,'USER_NOT_FOUND','Profil tidak ditemukan.');
    const u=user.rows[0];
    return {user:{id:u.id,email:u.email,displayName:u.display_name,avatarId:u.avatar_id,role:u.role,createdAt:new Date(u.created_at).toISOString()},wallet:{...wallet.rows[0],currency:'RP_GAME'},
      inventory:{cars:items.rows.filter(i=>i.kind==='car').map(i=>i.item_id),wheels:items.rows.filter(i=>i.kind==='wheel').map(i=>i.item_id)},
      accessibleCars:appearances.map(a=>a.carId),appearances,loadout,
      statistics:{races:stats.rows[0].races,wins:stats.rows[0].wins,rewards:stats.rows[0].rewards}};
  }

  async getLedger(userId: string, rawLimit: unknown=30) {
    const limit=typeof rawLimit==='string'?Number(rawLimit):rawLimit;
    v.integer(limit,'Limit',1,100);
    const result=await this.pool.query('SELECT id,delta,balance_after AS "balanceAfter",wallet_version AS "walletVersion",kind,reason,created_at AS "createdAt" FROM wallet_entries WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2',[userId,limit]);
    return {entries:result.rows};
  }

  async purchase(userId: string, input: unknown, key: unknown) {
    const body=v.object(input),itemId=v.text(body.itemId,'Item',1,40),catalogVersion=v.integer(body.catalogVersion,'Versi penawaran',1,2_147_483_647);
    return transaction(this.pool,client=>idempotent(client,userId,'purchase',key,{itemId,catalogVersion},async()=>{
      // Catalog rows are held stable until the complete debit+ownership transaction commits.
      const item=await client.query('SELECT * FROM catalog_items WHERE id=$1 AND active FOR SHARE',[itemId]);
      assert(item.rowCount,404,'ITEM_NOT_FOUND','Item tidak tersedia.');
      const row=item.rows[0];
      assert(row.kind==='car'||row.kind==='wheel',400,'SERVICE_REQUIRES_QUOTE','Layanan bengkel harus dibeli melalui penawaran kustomisasi.');
      assert(row.version===catalogVersion,409,'CATALOG_CHANGED','Harga item berubah. Muat ulang toko sebelum membeli.');
      await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE',[userId]);
      const owned=await client.query('SELECT 1 FROM user_items WHERE user_id=$1 AND item_id=$2',[userId,itemId]);
      assert(!owned.rowCount,409,'ALREADY_OWNED','Item sudah dimiliki.');
      const purchaseId=randomUUID();
      let entryId:string|null=null;
      if (BigInt(row.price)>0n) {
        const mutation=await mutateWallet(client,{userId,delta:-BigInt(row.price),kind:'purchase',eventKey:`purchase:${purchaseId}`,reason:`Pembelian ${row.name}`});
        entryId=mutation.entryId;
      }
      await client.query("INSERT INTO user_items(user_id,item_id,source) VALUES($1,$2,'purchase')",[userId,itemId]);
      await client.query('INSERT INTO purchases(id,user_id,item_id,price_paid,catalog_version,ledger_entry_id) VALUES($1,$2,$3,$4,$5,$6)',[purchaseId,userId,itemId,row.price,catalogVersion,entryId]);
      const wallet=await client.query('SELECT balance,version FROM wallets WHERE user_id=$1',[userId]);
      return {purchaseId,itemId,pricePaid:row.price,wallet:{...wallet.rows[0],currency:'RP_GAME'}};
    }));
  }

  async saveLoadout(userId:string,input:unknown){return this.appearances.saveLoadout(userId,input);}
  async quoteAppearance(userId:string,input:unknown){return this.appearances.quote(userId,input);}
  async applyAppearance(userId:string,input:unknown,key:unknown){return this.appearances.apply(userId,input,key);}

  async resolveLoadout(userId: string, input?: LoadoutSelection, rulesetVersion?: string): Promise<FrozenLoadout> {
    const selection=await this.appearances.resolve(this.pool,userId,input as unknown as Record<string,unknown>|undefined);
    const ruleset=await readRuleset(this.pool,rulesetVersion),wheel=await this.pool.query('SELECT version FROM catalog_items WHERE id=$1',[selection.rimId]);
    assert(ruleset.cars[selection.carId],409,'CAR_NOT_IN_RULESET','Mobil belum tersedia dalam versi aturan balapan ini.');
    return {...selection,stats:{...ruleset.cars[selection.carId]},tuningVersion:ruleset.version,partVersion:String(wheel.rows[0].version)};
  }

  async beginRace(input: BeginRaceInput): Promise<void> {
    const raceId=v.uuid(input.raceId,'Balapan');
    assert(CIRCUIT_IDS.includes(input.config.circuit),400,'INVALID_CIRCUIT','Sirkuit tidak valid.');
    v.integer(input.config.laps,'Lap',1,20);
    assert(input.participants.length>0 && input.participants.length<=32,400,'INVALID_PARTICIPANTS','Jumlah peserta tidak valid.');
    const humans=input.participants.filter(p=>!p.isBot);
    assert(humans.length>0 && humans.every(p=>p.userId) && new Set(humans.map(p=>p.userId)).size===humans.length,400,'INVALID_PARTICIPANTS','Peserta manusia harus unik.');
    const createdMs=Date.parse(input.scheduledStartAt??input.createdAt);
    assert(Number.isFinite(createdMs),400,'INVALID_START','Waktu balapan tidak valid.');
    await transaction(this.pool,async client=>{
      const ruleset=await readRuleset(client,input.rulesetVersion);
      const participants=input.participants.map(p=>({id:p.id,userId:p.userId,isBot:p.isBot,carId:p.carId,loadout:p.loadout})).sort((a,b)=>a.id.localeCompare(b.id));
      const config={...input.config,roomConfig:input.config,roomId:input.roomId,inviteCode:input.inviteCode,participants,beginHash:v.fingerprint(input)};
      const inserted=await client.query("INSERT INTO races(id,room_code,circuit,laps,ruleset_id,status,config,started_at) VALUES($1,$2,$3,$4,$5,'running',$6::jsonb,$7) ON CONFLICT(id) DO NOTHING RETURNING id",[raceId,input.inviteCode,input.config.circuit,input.config.laps,ruleset.databaseId,JSON.stringify(config),new Date(createdMs).toISOString()]);
      if (!inserted.rowCount) {
        const prior=await client.query('SELECT config FROM races WHERE id=$1',[raceId]);
        assert(prior.rows[0]?.config.beginHash===config.beginHash,409,'RACE_CONFLICT','ID balapan sudah digunakan.');
        return;
      }
      for (const participant of humans) {
        const userId=v.uuid(participant.userId,'Pemain'),selection=await this.appearances.resolve(client,userId,participant.loadout as unknown as Record<string,unknown>,true);
        assert(ruleset.cars[selection.carId],409,'CAR_NOT_IN_RULESET','Mobil belum tersedia dalam versi aturan balapan ini.');
        assert(participant.carId===selection.carId && participant.loadout.tuningVersion===ruleset.version && v.fingerprint(participant.loadout.stats)===v.fingerprint(ruleset.cars[selection.carId]),409,'LOADOUT_VERSION_MISMATCH','Performa peserta tidak cocok dengan aturan pertandingan.');
        await client.query('INSERT INTO race_participants(race_id,user_id,car_id,loadout) VALUES($1,$2,$3,$4::jsonb)',[raceId,userId,selection.carId,JSON.stringify(participant.loadout)]);
      }
    });
  }

  async finalizeRace(input: RaceResult): Promise<RaceSettlement> {
    const raceId=v.uuid(input.raceId,'Balapan'),hash=v.fingerprint(input);
    return transaction(this.pool,async client=>{
      const record=await client.query('SELECT * FROM races WHERE id=$1 FOR UPDATE',[raceId]);
      assert(record.rowCount,404,'RACE_NOT_FOUND','Balapan belum didaftarkan server.');
      const race=record.rows[0];
      if (race.status==='finished') {
        assert(race.result_hash===hash,409,'RESULT_CONFLICT','Hasil balapan yang tersimpan berbeda.');
        return race.settlement as RaceSettlement;
      }
      assert(race.status==='running',409,'RACE_NOT_RUNNING','Balapan tidak dapat diselesaikan.');
      const ruleset=await readRuleset(client,input.rulesetVersion);
      assert(race.ruleset_id===ruleset.databaseId && race.circuit===input.config.circuit && race.laps===input.config.laps && race.config.roomId===input.roomId && race.room_code===input.inviteCode && v.fingerprint(race.config.roomConfig)===v.fingerprint(input.config),409,'RACE_CONFIG_MISMATCH','Aturan balapan berubah.');
      const identities=input.participants.map(p=>({id:p.id,userId:p.userId,isBot:p.isBot,carId:p.carId,loadout:p.loadout})).sort((a,b)=>a.id.localeCompare(b.id));
      assert(v.fingerprint(identities)===v.fingerprint(race.config.participants),409,'PARTICIPANT_MISMATCH','Peserta atau loadout berubah setelah start.');
      const started=Date.parse(input.startedAt),ended=Date.parse(input.endedAt);
      // Simulation time may trail wall time after a busy server tick; that must not
      // strand a legitimate settlement. It cannot run materially ahead of wall time.
      assert(Number.isFinite(started)&&Number.isFinite(ended)&&ended>=started&&Number.isFinite(input.durationMs)&&input.durationMs>=0&&input.durationMs<=86_400_000&&input.durationMs<=ended-started+5000,400,'INVALID_RACE_TIME','Waktu balapan tidak konsisten.');
      const stored=await client.query('SELECT * FROM race_participants WHERE race_id=$1 ORDER BY user_id',[raceId]),humans=input.participants.filter(p=>!p.isBot);
      assert(humans.length===stored.rowCount && new Set(humans.map(p=>p.userId)).size===humans.length,409,'PARTICIPANT_MISMATCH','Daftar peserta berbeda.');
      const positions=new Set<number>();
      for (const participant of input.participants) {
        v.integer(participant.position,'Posisi',1,input.participants.length);
        assert(!positions.has(participant.position),400,'DUPLICATE_POSITION','Posisi hasil harus unik.');positions.add(participant.position);
      }
      const rewards:RaceSettlement['rewards']=[];
      // All wallet locks follow stable user-ID order to avoid inter-race deadlocks.
      for (const row of stored.rows) {
        const result=humans.find(p=>p.userId===row.user_id);
        assert(result && result.carId===row.car_id && v.fingerprint(result.loadout)===v.fingerprint(row.loadout),409,'PARTICIPANT_MISMATCH','Loadout peserta berubah setelah start.');
        v.integer(result.completedLaps,'Lap selesai',0,race.laps);
        assert(result.status==='finished'||result.status==='dnf',400,'INVALID_RESULT','Status hasil tidak valid.');
        if (result.status==='finished') {
          assert(result.completedLaps===race.laps && result.totalTimeMs!==null && Number.isFinite(result.totalTimeMs) && result.totalTimeMs>0 && result.totalTimeMs<=input.durationMs+1000,400,'INVALID_FINISH','Hasil finish tidak valid.');
        }
        assert(result.bestLapMs===null||(Number.isFinite(result.bestLapMs)&&result.bestLapMs>0),400,'INVALID_LAP_TIME','Waktu lap tidak valid.');
        assert(result.totalTimeMs===null||(Number.isFinite(result.totalTimeMs)&&result.totalTimeMs>0),400,'INVALID_FINISH','Waktu finish tidak valid.');
        assert(Number.isFinite(result.distanceMeters)&&result.distanceMeters>=0,400,'INVALID_DISTANCE','Jarak balapan tidak valid.');
        let reward=0n;
        const policy=ruleset.rewardPolicy;
        if (result.status==='finished' && (result.totalTimeMs??0)>=policy.minimumDurationMs && result.distanceMeters>0) {
          reward=BigInt(policy.finish)+BigInt(policy.perLap)*BigInt(result.completedLaps)+BigInt(policy.podium[result.position-1]??'0');
          if (reward>BigInt(policy.maximum)) reward=BigInt(policy.maximum);
        }
        await client.query('INSERT INTO race_results(race_id,user_id,position,status,completed_laps,total_time_ms,best_lap_ms,reward) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[raceId,row.user_id,result.position,result.status,result.completedLaps,result.totalTimeMs===null?null:Math.round(result.totalTimeMs),result.bestLapMs===null?null:Math.round(result.bestLapMs),reward.toString()]);
        let balance:string;
        if (reward>0n) {
          const wallet=await mutateWallet(client,{userId:row.user_id,delta:reward,kind:'race_reward',eventKey:`race:${raceId}:player:${row.user_id}:finish`,reason:`Hadiah balapan ${input.config.circuit} · posisi ${result.position}`});balance=wallet.balance;
        } else {
          const wallet=await client.query('SELECT balance FROM wallets WHERE user_id=$1',[row.user_id]);balance=wallet.rows[0].balance;
        }
        rewards.push({userId:row.user_id,amount:reward.toString(),balance});
      }
      const settlement:RaceSettlement={raceId,rewards};
      await client.query("UPDATE races SET status='finished',started_at=$2,finished_at=$3,result_hash=$4,settlement=$5::jsonb WHERE id=$1",[raceId,new Date(started).toISOString(),new Date(ended).toISOString(),hash,JSON.stringify(settlement)]);
      return settlement;
    });
  }

  async abortRace(raceId: string, reason='server_aborted'): Promise<void> {
    await this.pool.query("UPDATE races SET status='aborted',finished_at=now(),config=config||jsonb_build_object('abortReason',$2::text) WHERE id=$1 AND status='running'",[v.uuid(raceId),v.text(reason,'Alasan',1,200)]);
  }

  async abortInterruptedRaces(): Promise<number> {
    const result=await this.pool.query("UPDATE races SET status='aborted',finished_at=now() WHERE status='running'");
    return result.rowCount??0;
  }
}

export function createEconomyService(pool:Pool):EconomyService{return new EconomyService(pool);}
