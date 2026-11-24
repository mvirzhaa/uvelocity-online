import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import pg from 'pg';
import express from 'express';
import { migrate } from '../../db/migrate.js';
import { createServices } from '../index.js';
import type { BackendServices } from '../index.js';
import type { AuthResult, PublicUser } from '../accounts.js';
import { createApiRouter } from '../../routes/index.js';
import type { BeginRaceInput, RaceResult } from '../../../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for actual PostgreSQL integration tests.');
const databaseName=new URL(connectionString).pathname;
if (!/test/i.test(databaseName)) throw new Error('Refusing integration setup: TEST_DATABASE_URL database name must contain "test".');
const schema=`uv_backend_test_${process.pid}`;
const control=new pg.Pool({connectionString,max:2});
let pool:pg.Pool,services:BackendServices,alice:AuthResult,bob:AuthResult,admin:PublicUser,http:Server,base:string;
const password='Testing-UVelocity-2026';
const origin='http://127.0.0.1:43100';
const isService=(code:string)=>(error:unknown)=>!!error&&(error as {code?:string}).code===code;

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});
  const files=await migrate(pool);
  assert.equal(files.length,15);
  services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00.000Z')});
  alice=await services.accounts.register({email:'alice@example.test',displayName:'Alice Racer',password});
  bob=await services.accounts.register({email:'bob@example.test',displayName:'Bob Racer',password});
  admin=await services.accounts.createAdmin({email:'admin@example.test',displayName:'Test Operator',password});
  if(process.env.WRITE_API_FIXTURES==='1') {
    await writeFile('server/services/__tests__/response-fixtures.json',JSON.stringify({
      description:'Actual PostgreSQL responses from an isolated test database. Accounts are ephemeral test fixtures.',
      catalog:await services.economy.getCatalog(),profile:await services.economy.getProfile(alice.user.id),
      adminTuning:await services.admin.getTuning(admin.id),walletTransactions:await services.economy.getLedger(alice.user.id),
      adminUsers:await services.admin.listUsers(admin.id)
    },null,2)+'\n');
  }
  const app=express();app.use(express.json({limit:'32kb'}));app.use('/api',createApiRouter({services,allowedOrigins:[origin],secureCookies:false}));
  http=app.listen(0,'127.0.0.1');await once(http,'listening');
  const address=http.address();assert(address&&typeof address==='object');base=`http://127.0.0.1:${address.port}/api`;
});
after(async()=>{
  if(http)await new Promise<void>((resolve,reject)=>http.close(error=>error?reject(error):resolve()));
  if(pool)await pool.end();
  await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await control.end();
});

async function request(path:string,options:{method?:string;body?:unknown;cookie?:string;csrf?:string;origin?:string|null;key?:string}={}) {
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(options.origin!==null)headers.Origin=options.origin??origin;
  if(options.cookie)headers.Cookie=options.cookie;
  if(options.csrf)headers['X-CSRF-Token']=options.csrf;
  if(options.key)headers['Idempotency-Key']=options.key;
  const response=await fetch(base+path,{method:options.method??'GET',headers,...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
  return {response,body:await response.json() as any};
}

test('migrations are repeatable; seed is actual PostgreSQL and starter grant is atomic once',async()=>{
  assert.deepEqual(await migrate(pool),[]);
  const version=await pool.query('SELECT version()');assert.match(version.rows[0].version,/PostgreSQL/);
  const profile=await services.economy.getProfile(alice.user.id);
  assert.equal(profile.wallet.balance,'25000');assert.equal(profile.wallet.version,'1');
  assert.deepEqual(profile.inventory,{cars:['brz'],wheels:['stock']});
  const hash=await pool.query('SELECT password_hash FROM users WHERE id=$1',[alice.user.id]);
  assert.match(hash.rows[0].password_hash,/^scrypt\$131072\$8\$1\$/);
  assert(!hash.rows[0].password_hash.includes(password));
  await assert.rejects(services.accounts.register({email:'ALICE@EXAMPLE.TEST',displayName:'Duplicate',password}),isService('EMAIL_IN_USE'));
  const count=await pool.query("SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1 AND kind='starter'",[alice.user.id]);assert.equal(count.rows[0].n,1);
});

test('all20 cars match canonical arcade tuning and wheels stay cosmetic',async()=>{
  const catalog=await services.economy.getCatalog();assert.equal(catalog.cars.length,20);assert.equal(catalog.wheels.length,4);
  const rules=await services.economy.getActiveRuleset();
  assert.equal(rules.cars.brz.topSpeed,255);assert.equal(rules.cars.veyron77.zeroTo100,2.7);assert.equal(rules.cars.kaze.handling,1.16);
  assert(catalog.wheels.every((wheel:any)=>wheel.cosmeticOnly));
  assert.equal(catalog.wheels.find((wheel:any)=>wheel.id==='six-spoke')?.price,'20000');
});

test('HTTP requires exact Origin and JSON before register/login',async()=>{
  const body={email:'new@example.test',displayName:'New Racer',password};
  assert.equal((await request('/auth/register',{method:'POST',body,origin:null})).response.status,403);
  assert.equal((await request('/auth/register',{method:'POST',body,origin:'https://attacker.example'})).response.status,403);
  const response=await fetch(base+'/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:'anything'});assert.equal(response.status,415);
  assert.deepEqual((await request('/auth/me')).body,{user:null,csrfToken:null});
});

test('sessions use HttpOnly cookies; CSRF, RBAC, profile validation and logout are enforced',async()=>{
  const logged=await request('/auth/login',{method:'POST',body:{email:alice.user.email,password}});assert.equal(logged.response.status,200);
  const cookieHeader=logged.response.headers.get('set-cookie')!;assert.match(cookieHeader,/HttpOnly/i);assert.match(cookieHeader,/SameSite=Lax/i);assert.match(cookieHeader,/Path=\//i);
  const cookie=cookieHeader.split(';')[0]!,csrf=logged.body.csrfToken;
  assert.equal((await request('/auth/me',{cookie})).body.user.id,alice.user.id);
  assert.equal((await request('/profile',{method:'PATCH',cookie,body:{displayName:'No CSRF'}})).response.status,403);
  assert.equal((await request('/profile',{method:'PATCH',cookie,csrf:'x'.repeat(43),body:{displayName:'Bad CSRF'}})).response.status,403);
  assert.equal((await request('/profile',{method:'PATCH',cookie,csrf,body:{avatarId:'https://attacker.example/avatar.svg'}})).response.status,400);
  const changed=await request('/profile',{method:'PATCH',cookie,csrf,body:{displayName:'Alice Updated',avatarId:'driver-3'}});assert.equal(changed.response.status,200);assert.equal(changed.body.user.avatarId,'driver-3');
  assert.equal((await request('/admin/users',{cookie})).response.status,403);
  assert.equal((await request('/admin/topups',{method:'POST',cookie,csrf,key:'player-admin-fail',body:{userId:alice.user.id,amount:'99999',reference:'forbidden-01',reason:'Forged admin request'}})).response.status,403);
  assert.equal((await request('/auth/logout',{method:'POST',cookie,csrf,body:{}})).response.status,200);
  assert.deepEqual((await request('/auth/me',{cookie})).body,{user:null,csrfToken:null});
});

test('race tickets are opaque, bound to the session, expire and can be consumed once',async()=>{
  const headers={cookie:`uv_session=${alice.sessionToken}`};
  const session=await services.accounts.authenticateSession(headers);assert(session);
  const first=await services.accounts.issueRaceTicket(session);
  assert.equal(await services.accounts.consumeRaceTicket({ticket:first.ticket,headers:{cookie:`uv_session=${bob.sessionToken}`}}),null);
  const results=await Promise.all([1,2,3].map(()=>services.accounts.consumeRaceTicket({ticket:first.ticket,headers})));
  assert.equal(results.filter(Boolean).length,1);assert.equal(results.find(Boolean)?.id,alice.user.id);
  const expired=await services.accounts.issueRaceTicket(session);await pool.query('UPDATE race_tickets SET expires_at=now()-interval \'1 second\'');
  assert.equal(await services.accounts.consumeRaceTicket({ticket:expired.ticket,headers}),null);
});

test('purchase retry/concurrent requests debit once and conflicting idempotency payload fails',async()=>{
  const payload={itemId:'six-spoke',catalogVersion:1};
  const results=await Promise.all(Array.from({length:6},()=>services.economy.purchase(alice.user.id,payload,'alice-buy-six-spoke')));
  assert(results.every(result=>result.purchaseId===results[0]!.purchaseId));
  assert.equal((await services.economy.getProfile(alice.user.id)).wallet.balance,'5000');
  await assert.rejects(services.economy.purchase(alice.user.id,{itemId:'mesh',catalogVersion:1},'alice-buy-six-spoke'),isService('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(services.economy.purchase(alice.user.id,payload,'alice-buy-again-newkey'),isService('ALREADY_OWNED'));
  const entries=await pool.query("SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1 AND kind='purchase'",[alice.user.id]);assert.equal(entries.rows[0].n,1);
});

test('concurrent individually affordable purchases cannot overspend one wallet',async()=>{
  await services.admin.updateCatalog(admin.id,'multi-spoke',{price:'15000',expectedVersion:1,reason:'Concurrency test price'});
  const results=await Promise.allSettled([
    services.economy.purchase(bob.user.id,{itemId:'six-spoke',catalogVersion:1},'bob-buy-six-spoke'),
    services.economy.purchase(bob.user.id,{itemId:'multi-spoke',catalogVersion:2},'bob-buy-multi-spoke')
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(failure.reason.code,'INSUFFICIENT_BALANCE');
  const profile=await services.economy.getProfile(bob.user.id);assert(['5000','10000'].includes(profile.wallet.balance));assert.equal(profile.inventory.wheels.length,2);
});

test('admin topup uses unique business reference and records exactly one audit',async()=>{
  const input={userId:alice.user.id,amount:'300000',reference:'grant-concurrency-0001',reason:'Integration credit grant'};
  const results=await Promise.all(Array.from({length:5},()=>services.admin.topup(admin.id,input,'same-admin-request')));
  assert(results.every(r=>r.entryId===results[0]!.entryId));
  assert.equal((await services.economy.getProfile(alice.user.id)).wallet.balance,'305000');
  const retry=await services.admin.topup(admin.id,input,'different-admin-key');assert.equal(retry.alreadyApplied,true);
  await assert.rejects(services.admin.topup(admin.id,{...input,amount:'999999'},'reference-conflict-key'),isService('REFERENCE_CONFLICT'));
  await assert.rejects(services.admin.topup(alice.user.id,input,'nonadmin-service-key'),isService('ADMIN_REQUIRED'));
  const audit=await pool.query("SELECT count(*)::int n FROM admin_audit WHERE action='wallet.topup' AND target_id=$1",[alice.user.id]);assert.equal(audit.rows[0].n,1);
});

test('later SQL failure rolls back debit, inventory, ledger and idempotency record together',async()=>{
  const before=await services.economy.getProfile(alice.user.id);
  await pool.query(`CREATE FUNCTION test_reject_purchase() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_id='kaze' THEN RAISE EXCEPTION 'forced downstream failure'; END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER test_fail_purchase BEFORE INSERT ON purchases FOR EACH ROW EXECUTE FUNCTION test_reject_purchase()');
  try {await assert.rejects(services.economy.purchase(alice.user.id,{itemId:'kaze',catalogVersion:1},'rollback-purchase-key'));}
  finally {await pool.query('DROP TRIGGER test_fail_purchase ON purchases');await pool.query('DROP FUNCTION test_reject_purchase()');}
  const after=await services.economy.getProfile(alice.user.id);assert.equal(after.wallet.balance,before.wallet.balance);assert(!after.inventory.cars.includes('kaze'));
  const pending=await pool.query('SELECT 1 FROM idempotency_requests WHERE key=$1',['rollback-purchase-key']);assert.equal(pending.rowCount,0);
});

test('catalog version conflicts and unowned loadouts are rejected; owned rims do not affect tuning',async()=>{
  await assert.rejects(services.economy.purchase(alice.user.id,{itemId:'multi-spoke',catalogVersion:1},'stale-price-request'),isService('CATALOG_CHANGED'));
  await assert.rejects(services.admin.updateCatalog(admin.id,'multi-spoke',{price:'1',expectedVersion:1,reason:'Stale admin price'}),isService('CATALOG_CHANGED'));
  await assert.rejects(services.economy.resolveLoadout(alice.user.id,{carId:'aventador',color:'#ff0000',finish:'gloss',rimId:'stock'}),isService('CAR_LOCKED'));
  const stock=await services.economy.resolveLoadout(alice.user.id,{carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock'});
  const six=await services.economy.resolveLoadout(alice.user.id,{carId:'brz',color:'#2866b8',finish:'metallic',rimId:'six-spoke'});assert.deepEqual(stock.stats,six.stats);
});

test('rim paint persists across sessions and snapshots without bypassing wheel ownership',async()=>{
  const painted={carId:'brz' as const,rimId:'six-spoke',color:'#2866b8',rimColor:'#DDAA66',finish:'metallic' as const};
  const quote=await services.economy.quoteAppearance(alice.user.id,painted);assert.equal(quote.total,'5000');
  await services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'paid-rim-repaint-test');
  const logged=await services.accounts.login({email:alice.user.email,password});
  const session=await services.accounts.authenticateSession({cookie:`uv_session=${logged.sessionToken}`});assert(session);
  assert.equal((await services.economy.getProfile(session.id)).loadout.rimColor,'#ddaa66');
  assert.equal((await services.economy.resolveLoadout(session.id)).rimColor,'#ddaa66');
  const bodyQuote=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',rimId:'six-spoke',color:'#335577',finish:'gloss'});
  await services.economy.applyAppearance(alice.user.id,{quoteId:bodyQuote.quoteId},'paid-body-repaint-test');
  assert.equal((await services.economy.resolveLoadout(alice.user.id,{carId:'brz',rimId:'six-spoke',color:'#335577',finish:'gloss'})).rimColor,'#ddaa66');
  await assert.rejects(services.economy.quoteAppearance(alice.user.id,{...painted,rimId:'mesh',rimColor:'#123456'}),isService('WHEEL_NOT_OWNED'));
  await assert.rejects(services.economy.quoteAppearance(alice.user.id,{...painted,rimColor:'rgb(1,2,3)'}),isService('INVALID_COLOR'));
  const profile=await services.economy.getProfile(alice.user.id);assert.equal(profile.loadout.rimId,'six-spoke');assert.equal(profile.loadout.rimColor,'#ddaa66');
});

test('published tuning is immutable, compare-and-swap protected and old versions remain usable',async()=>{
  const old=await services.economy.getActiveRuleset();assert.equal(old.version,'4');
  const published=await services.admin.publishTuning(admin.id,{expectedVersion:old.version,carId:'brz',topSpeed:260,zeroTo100:5.5,handling:1.2,reason:'Test next-race balance update'});assert.equal(published.version,String(Number(old.version)+1));
  const next=await services.economy.getActiveRuleset();assert.equal(next.cars.brz.topSpeed,260);
  const frozen=await services.economy.resolveLoadout(alice.user.id,undefined,'1');assert.equal(frozen.stats.topSpeed,255);assert.equal(frozen.tuningVersion,'1');
  await assert.rejects(services.admin.publishTuning(admin.id,{expectedVersion:old.version,carId:'brz',topSpeed:270,zeroTo100:5,handling:1.2,reason:'Stale racing update'}),isService('RULESET_CHANGED'));
  await assert.rejects(services.admin.publishTuning(admin.id,{expectedVersion:published.version,carId:'brz',topSpeed:9999,zeroTo100:0,handling:100,reason:'Invalid racing update'}),isService('INVALID_TUNING'));
  await assert.rejects(pool.query('UPDATE ruleset_cars SET top_speed=300 WHERE car_id=$1',['brz']),isService('55000'));
  await assert.rejects(pool.query("UPDATE wallet_entries SET reason='tampered' WHERE user_id=$1",[alice.user.id]),isService('55000'));
});

test('server race settlement is atomic and idempotent; DNF receives zero and forged replay conflicts',async()=>{
  const raceId=randomUUID(),first=await services.economy.resolveLoadout(alice.user.id,undefined,'1'),second=await services.economy.resolveLoadout(bob.user.id,undefined,'1');
  const config={circuit:'city' as const,laps:2,bots:0,maxHumans:4,difficulty:'normal' as const,collisionMode:'solid' as const};
  const input:BeginRaceInput={raceId,roomId:'room-test',inviteCode:'TEST42',config,rulesetVersion:'1',createdAt:'2026-01-01T10:00:00.000Z',participants:[
    {id:'alice',userId:alice.user.id,isBot:false,name:'Alice',carId:'brz',loadout:first},{id:'bob',userId:bob.user.id,isBot:false,name:'Bob',carId:'brz',loadout:second}
  ]};
  await services.economy.beginRace(input);await services.economy.beginRace(input);
  // Fixed-tick simulation may trail wall time under server load.
  const result:RaceResult={raceId,roomId:input.roomId,inviteCode:input.inviteCode,config,rulesetVersion:'1',startedAt:input.createdAt,endedAt:'2026-01-01T10:00:42.000Z',durationMs:30000,participants:[
    {...input.participants[0]!,status:'finished',position:1,completedLaps:2,bestLapMs:14000,totalTimeMs:28000,progress:2,distanceMeters:4000,connectedAtFinish:true},
    {...input.participants[1]!,status:'dnf',position:2,completedLaps:1,bestLapMs:15000,totalTimeMs:null,progress:1.2,distanceMeters:2400,connectedAtFinish:false}
  ]};
  const before=await services.economy.getProfile(alice.user.id);
  const results=await Promise.all(Array.from({length:6},()=>services.economy.finalizeRace(result)));
  for(const result of results)assert.deepEqual(result,results[0]);
  assert.equal(results[0]!.rewards.find(r=>r.userId===alice.user.id)?.amount,'27000');assert.equal(results[0]!.rewards.find(r=>r.userId===bob.user.id)?.amount,'0');
  assert.equal(BigInt((await services.economy.getProfile(alice.user.id)).wallet.balance)-BigInt(before.wallet.balance),27000n);
  const count=await pool.query("SELECT count(*)::int n FROM wallet_entries WHERE event_key=$1",[`race:${raceId}:player:${alice.user.id}:finish`]);assert.equal(count.rows[0].n,1);
  await assert.rejects(services.economy.finalizeRace({...result,durationMs:31000}),isService('RESULT_CONFLICT'));
  await assert.rejects(services.economy.finalizeRace({...result,raceId:randomUUID()}),isService('RACE_NOT_FOUND'));
});

test('history/admin queries are bounded and server-side RBAC is not only a UI control',async()=>{
  const history=await services.economy.getLedger(alice.user.id,3);assert.equal(history.entries.length,3);
  assert(history.entries.every(row=>typeof row.delta==='string'));
  await assert.rejects(services.economy.getLedger(alice.user.id,1000),isService('INVALID_NUMBER'));
  await assert.rejects(services.admin.listUsers(alice.user.id),isService('ADMIN_REQUIRED'));
  const users=await services.admin.listUsers(admin.id,'Alice');assert.equal(users.users.length,1);assert.equal(users.users[0].id,alice.user.id);
  const audit=await services.admin.getAudit(admin.id,100);assert(audit.entries.some(entry=>entry.action==='ruleset.published'));
  const drift=await pool.query('SELECT w.user_id FROM wallets w LEFT JOIN wallet_entries e ON e.user_id=w.user_id GROUP BY w.user_id,w.balance HAVING w.balance<>COALESCE(sum(e.delta),0)');assert.equal(drift.rowCount,0);
});
