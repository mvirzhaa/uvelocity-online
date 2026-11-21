import 'dotenv/config';
import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import pg from 'pg';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {migrate} from '../../db/migrate.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult,PublicUser} from '../accounts.js';
import {registerRaceRooms} from '../../realtime/RaceRoom.js';
import type {BeginRaceInput,RoomSnapshot} from '../../../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use tests/with-postgres.mjs.');
const schema='uv_appearance_'+process.pid,control=new pg.Pool({connectionString,max:2});let pool:pg.Pool,services:BackendServices,alice:AuthResult,bob:AuthResult,admin:PublicUser,legacy:any,legacyDirectory:string;
const password='Appearance-Testing-2026!',isService=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string,timeout=6000){const deadline=Date.now()+timeout;while(!check()){if(Date.now()>deadline)throw new Error('Timeout: '+label);await delay(10);}}
async function item(id:string){const result=await pool.query('SELECT * FROM catalog_items WHERE id=$1',[id]);return result.rows[0];}
async function change(id:string,body:Record<string,unknown>){const row=await item(id);return services.admin.updateCatalog(admin.id,id,{...body,expectedVersion:row.version,reason:'Appearance regression fixture'});}
async function pay(input:unknown,key=randomUUID()){const quote=await services.economy.quoteAppearance(alice.user.id,input);return services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},key);}

before(async()=>{
 await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:15});
 legacyDirectory=await mkdtemp(path.join(tmpdir(),'uv-legacy-migrations-'));
 for(const name of await readdir('database/migrations'))if(/^00[1-5]_/.test(name))await copyFile(path.join('database/migrations',name),path.join(legacyDirectory,name));
 assert.equal((await migrate(pool,legacyDirectory)).length,5);services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00.000Z')});
 alice=await services.accounts.register({email:'legacy@example.test',displayName:'Legacy Owner',password});bob=await services.accounts.register({email:'temporary@example.test',displayName:'Temporary Driver',password});admin=await services.accounts.createAdmin({email:'operator@example.test',displayName:'Operator',password});
 await services.admin.topup(admin.id,{userId:alice.user.id,amount:'1000000',reference:'legacy-preservation-credit',reason:'Legacy data preservation fixture'},'legacy-preservation-topup');
 await services.economy.purchase(alice.user.id,{itemId:'kaze',catalogVersion:1},'legacy-kaze-purchase');await services.economy.purchase(alice.user.id,{itemId:'six-spoke',catalogVersion:1},'legacy-six-spoke-purchase');
 await pool.query("UPDATE loadouts SET color='#ABCDEF',finish='matte',rim_color='#DDAA66',wheel_item_id='six-spoke',version=9 WHERE user_id=$1",[alice.user.id]);
 await services.admin.publishTuning(admin.id,{expectedVersion:'1',carId:'brz',topSpeed:277,zeroTo100:5.2,handling:1.25,reason:'Legacy operator tuning survives expansion'});
 await pool.query("UPDATE catalog_items SET price=165000,version=2 WHERE id='kaze'");
 legacy={wallet:(await pool.query('SELECT * FROM wallets WHERE user_id=$1',[alice.user.id])).rows[0],entries:(await pool.query('SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1',[alice.user.id])).rows[0].n,loadout:(await pool.query('SELECT * FROM loadouts WHERE user_id=$1',[alice.user.id])).rows[0]};
 assert.deepEqual(await migrate(pool),['006_paid_appearances_and_car_access.sql','007_expanded_vehicle_catalog.sql','008_personal_prayer_breaks.sql','009_presentation_media.sql','010_vehicle_thumbnails.sql','011_stock_rim_and_stripe_paint.sql','012_reference_vehicle_name.sql','013_panther_grand_touring.sql','014_vehicle_categories.sql']);
});
after(async()=>{if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();if(legacyDirectory)await rm(legacyDirectory,{recursive:true,force:true});});

test('additive migration preserves old users, inventory, balances, selected paint and admin tuning',async()=>{
 assert.deepEqual(await migrate(pool),[]);
 const wallet=(await pool.query('SELECT * FROM wallets WHERE user_id=$1',[alice.user.id])).rows[0];assert.deepEqual(wallet,legacy.wallet);
 const selected=(await pool.query('SELECT * FROM loadouts WHERE user_id=$1',[alice.user.id])).rows[0];assert.equal(selected.color,legacy.loadout.color);assert.equal(selected.rim_color,legacy.loadout.rim_color);assert.equal(selected.version,'9');
 const profile=await services.economy.getProfile(alice.user.id);assert.deepEqual(profile.inventory,{cars:['brz','kaze'],wheels:['six-spoke','stock']});assert.equal(profile.appearances.find(a=>a.carId==='brz')!.color,'#abcdef');assert.equal(profile.appearances.find(a=>a.carId==='brz')!.rimColor,'#ddaa66');assert.equal(profile.appearances.find(a=>a.carId==='kaze')!.color,'#d9e1e5');assert.equal(profile.loadout.finish,'matte');
 const catalog=await services.economy.getCatalog();assert.equal(catalog.cars.length,16);assert.equal(catalog.services.length,9);assert.equal(catalog.stripes.length,5);assert.equal(catalog.cars.find(c=>c.id==='kaze')!.price,'165000');
 const active=await services.economy.getActiveRuleset();assert.equal(active.version,'4');assert.equal(active.cars.brz.topSpeed,277);assert.equal(active.cars['jesko-absolut'].topSpeed,420);
 const original=await services.economy.resolveLoadout(alice.user.id,undefined,'1');assert.equal(original.stats.topSpeed,255);assert.equal((await pool.query('SELECT count(*)::int n FROM ruleset_cars WHERE ruleset_id=(SELECT id FROM rulesets WHERE version=2)')).rows[0].n,8);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1',[alice.user.id])).rows[0].n,legacy.entries);
});

test('quotes debit nothing; combined paint/rim/stripe apply and concurrent retries debit exactly once',async()=>{
 const before=await services.economy.getProfile(alice.user.id),quote=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',rimId:'six-spoke',color:'#2468AC',finish:'gloss',rimColor:'#222222',stripeId:'twin-racing',stripeColor:'#ffffff'});
 assert.equal(quote.total,'30000');assert.deepEqual(quote.lineItems.map(x=>x.itemId),['paint-body','paint-rims','stripe-twin-racing']);assert.equal((await services.economy.getProfile(alice.user.id)).wallet.balance,before.wallet.balance);
 const responses=await Promise.all(Array.from({length:8},()=>services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'combined-paint-retry')));assert(responses.every(r=>r.applicationId===responses[0]!.applicationId));
 const applied=responses[0]!;assert.equal(applied.appearance.color,'#2468ac');assert.equal(applied.loadout.stripeId,'twin-racing');assert.equal(BigInt(before.wallet.balance)-BigInt(applied.wallet.balance),30000n);
 const again=await services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'same-quote-new-key');assert.equal(again.applicationId,applied.applicationId);
 const next=await services.economy.quoteAppearance(alice.user.id,{carId:'brz'});await assert.rejects(services.economy.applyAppearance(alice.user.id,{quoteId:next.quoteId},'combined-paint-retry'),isService('IDEMPOTENCY_CONFLICT'));
 assert.equal((await pool.query("SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1 AND kind='customization'",[alice.user.id])).rows[0].n,1);
});

test('no-op, restoring each saved car and owned wheel selection are free',async()=>{
 const before=await services.economy.getProfile(alice.user.id),quote=await services.economy.quoteAppearance(alice.user.id,{carId:'brz'});assert.equal(quote.total,'0');assert.equal(quote.noOp,true);
 const applied=await services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'noop-appearance-apply');assert.equal(applied.appearance.version,quote.appearanceVersion);assert.equal(applied.wallet.balance,before.wallet.balance);
 await services.economy.saveLoadout(alice.user.id,{carId:'kaze'});assert.equal((await services.economy.getProfile(alice.user.id)).loadout.color,'#d9e1e5');
 await services.economy.saveLoadout(alice.user.id,{carId:'brz'});assert.equal((await services.economy.getProfile(alice.user.id)).loadout.stripeId,'twin-racing');
 await services.economy.saveLoadout(alice.user.id,{carId:'brz',rimId:'stock'});await services.economy.saveLoadout(alice.user.id,{carId:'brz',rimId:'six-spoke'});
 assert.equal((await services.economy.getProfile(alice.user.id)).wallet.balance,before.wallet.balance);
});

test('PUT loadout, generic shop purchase, frozen loadout and beginRace cannot bypass paid cosmetics',async()=>{
 const installed=(await services.economy.getProfile(alice.user.id)).loadout;
 for(const changes of[{color:'#123456'},{finish:'matte'},{rimColor:'#fefefe'},{stockRimPainted:true},{stripeId:'heritage'},{stripeColor:'#ff0000'}]){
  await assert.rejects(services.economy.saveLoadout(alice.user.id,{...installed,...changes}),isService('PAID_CUSTOMIZATION_REQUIRED'));
  await assert.rejects(services.economy.resolveLoadout(alice.user.id,{...installed,...changes} as any),isService('PAID_CUSTOMIZATION_REQUIRED'));
 }
 await assert.rejects(services.economy.purchase(alice.user.id,{itemId:'stripe-heritage',catalogVersion:1},'service-shop-bypass'),isService('SERVICE_REQUIRES_QUOTE'));
 const stockQuote=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',rimId:'stock',rimColor:'#777777'});assert.equal(stockQuote.total,'5000');assert.equal(stockQuote.selection.stockRimPainted,true);
 const frozen=await services.economy.resolveLoadout(alice.user.id),race:BeginRaceInput={raceId:randomUUID(),roomId:'forged',inviteCode:'FORGED',config:{circuit:'city',laps:1,bots:0,maxHumans:1,difficulty:'normal',collisionMode:'solid'},rulesetVersion:frozen.tuningVersion,createdAt:new Date().toISOString(),participants:[{id:'p',userId:alice.user.id,isBot:false,name:'Legacy',carId:'brz',loadout:{...frozen,stripeId:'heritage'}}]};
 await assert.rejects(services.economy.beginRace(race),isService('PAID_CUSTOMIZATION_REQUIRED'));assert.equal((await pool.query('SELECT 1 FROM races WHERE id=$1',[race.raceId])).rowCount,0);
});

test('appearance CAS prevents two distinct quotes from overwriting or charging the same version',async()=>{
 const before=await services.economy.getProfile(alice.user.id),a=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',color:'#345678'}),b=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',color:'#987654'});
 const results=await Promise.allSettled([services.economy.applyAppearance(alice.user.id,{quoteId:a.quoteId},'cas-appearance-a'),services.economy.applyAppearance(alice.user.id,{quoteId:b.quoteId},'cas-appearance-b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'APPEARANCE_CHANGED');
 assert.equal(BigInt(before.wallet.balance)-BigInt((await services.economy.getProfile(alice.user.id)).wallet.balance),10000n);
});

test('admin service pricing invalidates stale quotes; expired and other-user quotes cannot debit',async()=>{
 const quote=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',color:'#555555'}),before=await services.economy.getProfile(alice.user.id);
 await change('paint-body',{price:'20000'});await assert.rejects(services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'stale-workshop-price'),isService('CATALOG_CHANGED'));
 assert.equal((await services.economy.getProfile(alice.user.id)).wallet.balance,before.wallet.balance);
 const fresh=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',color:'#555555'});assert.equal(fresh.total,'20000');await assert.rejects(services.economy.applyAppearance(bob.user.id,{quoteId:fresh.quoteId},'stolen-workshop-quote'),isService('QUOTE_NOT_FOUND'));
 await pool.query("UPDATE appearance_quotes SET expires_at=now()-interval '1 second' WHERE id=$1",[fresh.quoteId]);await assert.rejects(services.economy.applyAppearance(alice.user.id,{quoteId:fresh.quoteId},'expired-workshop-quote'),isService('QUOTE_EXPIRED'));
 await change('paint-body',{enabled:false});await assert.rejects(services.economy.quoteAppearance(alice.user.id,{carId:'brz',color:'#555555'}),isService('SERVICE_UNAVAILABLE'));await change('paint-body',{enabled:true});
});

test('insufficient funds and downstream SQL failure roll back wallet, paint, selected loadout and idempotency together',async()=>{
 const poorQuote=await services.economy.quoteAppearance(bob.user.id,{carId:'brz',color:'#777777',stripeId:'heritage'});assert.equal(poorQuote.affordable,false);
 await assert.rejects(services.economy.applyAppearance(bob.user.id,{quoteId:poorQuote.quoteId},'unaffordable-workshop'),isService('INSUFFICIENT_BALANCE'));assert.equal((await services.economy.getProfile(bob.user.id)).wallet.balance,'25000');
 const before=await services.economy.getProfile(alice.user.id),quote=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',color:'#999999'}),entries=(await pool.query('SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1',[alice.user.id])).rows[0].n;
 await pool.query(`CREATE FUNCTION fail_appearance_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced application failure'; END; $$`);await pool.query('CREATE TRIGGER fail_appearance BEFORE INSERT ON appearance_applications FOR EACH ROW EXECUTE FUNCTION fail_appearance_fixture()');
 try{await assert.rejects(services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'rollback-workshop'));}finally{await pool.query('DROP TRIGGER fail_appearance ON appearance_applications');await pool.query('DROP FUNCTION fail_appearance_fixture()');}
 const after=await services.economy.getProfile(alice.user.id);assert.deepEqual(after.wallet,before.wallet);assert.deepEqual(after.loadout,before.loadout);assert.deepEqual(after.appearances,before.appearances);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wallet_entries WHERE user_id=$1',[alice.user.id])).rows[0].n,entries);assert.equal((await pool.query("SELECT 1 FROM idempotency_requests WHERE key='rollback-workshop'")).rowCount,0);
 const retried=await services.economy.applyAppearance(alice.user.id,{quoteId:quote.quoteId},'rollback-workshop');assert.equal(retried.pricePaid,'20000');
});

test('same-design stripe recolor uses its own fee, removal charges once and absent-stripe edits are no-op',async()=>{
 const recolor=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',stripeId:'twin-racing',stripeColor:'#ffcc00'});assert.equal(recolor.total,'5000');assert.equal(recolor.lineItems[0]!.itemId,'stripe-paint');await services.economy.applyAppearance(alice.user.id,{quoteId:recolor.quoteId},'stripe-recolor-test');
 const removed=await pay({carId:'brz',stripeId:'none'});assert.equal(removed.pricePaid,'5000');const noop=await services.economy.quoteAppearance(alice.user.id,{carId:'brz',stripeId:'none',stripeColor:'#111111'});assert.equal(noop.total,'0');assert.equal(noop.noOp,true);
});

test('global unlock is temporary access, independent of sale status; permanent buyers survive relock',async()=>{
 await change('kaze',{locked:false,enabled:false});let temporary=await services.economy.getProfile(bob.user.id);assert(temporary.accessibleCars.includes('kaze'));assert(!temporary.inventory.cars.includes('kaze'));assert.equal(temporary.appearances.find(a=>a.carId==='kaze')!.canCustomize,false);
 await services.economy.saveLoadout(bob.user.id,{carId:'kaze'});temporary=await services.economy.getProfile(bob.user.id);assert.equal(temporary.loadout.carId,'kaze');assert.equal(temporary.wallet.balance,'25000');
 await assert.rejects(services.economy.quoteAppearance(bob.user.id,{carId:'kaze',color:'#ff0000'}),isService('CAR_NOT_OWNED'));
 await change('kaze',{enabled:true});const buyer=await services.accounts.register({email:'permanent@example.test',displayName:'Permanent Buyer',password});await services.admin.topup(admin.id,{userId:buyer.user.id,amount:'200000',reference:'permanent-buyer-grant',reason:'Permanent purchase while free'},'permanent-buyer-topup');
 const price=await item('kaze');await services.economy.purchase(buyer.user.id,{itemId:'kaze',catalogVersion:price.version},'permanent-while-unlocked');
 const stale=temporary.loadout;await change('kaze',{locked:true});temporary=await services.economy.getProfile(bob.user.id);assert(!temporary.accessibleCars.includes('kaze'));assert.deepEqual(temporary.inventory.cars,['brz']);assert.equal(temporary.loadout.carId,'brz');assert.equal(temporary.wallet.balance,'25000');
 await assert.rejects(services.economy.saveLoadout(bob.user.id,{carId:'kaze'}),isService('CAR_LOCKED'));await assert.rejects(services.economy.resolveLoadout(bob.user.id,stale),isService('CAR_LOCKED'));
 assert((await services.economy.getProfile(alice.user.id)).accessibleCars.includes('kaze'));assert((await services.economy.getProfile(buyer.user.id)).inventory.cars.includes('kaze'));await services.economy.saveLoadout(buyer.user.id,{carId:'kaze'});
 await assert.rejects(change('paint-body',{locked:false}),isService('INVALID_LOCKED'));
});

test('actual room rejects unpaid appearance and relocked lobby access but preserves a started race snapshot',{timeout:20000},async()=>{
 const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false}),opened:Room[]=[];
 registerRaceRooms(server,{consumeRaceTicket:input=>services.accounts.consumeRaceTicket(input),authenticate:headers=>services.accounts.authenticateSession(headers),gameplayAccess:userId=>services.prayer.status(userId),resolveLoadout:(userId,selection,version)=>services.economy.resolveLoadout(userId,selection,version),getActiveRuleset:()=>services.economy.getActiveRuleset(),beginRace:input=>services.economy.beginRace(input),finalizeRace:result=>services.economy.finalizeRace(result),abortRace:id=>services.economy.abortRace(id)}, {countdownMs:60,snapshotRateMs:25,maxRaceDurationMs:2500,finishRetentionMs:3000});
 await server.listen(0,'127.0.0.1');const address=http.address();assert(address&&typeof address==='object');const endpoint='http://127.0.0.1:'+address.port;
 async function sdk(user:AuthResult){const headers={cookie:'uv_session='+user.sessionToken},session=await services.accounts.authenticateSession(headers);assert(session);return{client:new Client(endpoint,{headers}),ticket:(await services.accounts.issueRaceTicket(session)).ticket};}
 function observe(room:Room){opened.push(room);room.reconnection.enabled=false;const state:{snapshot?:RoomSnapshot;errors:any[];results:any[]}={errors:[],results:[]},acknowledged=new Set<string>();room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{state.snapshot=snapshot;if(snapshot.phase==='loading'&&snapshot.startToken&&snapshot.racers.length&&!acknowledged.has(snapshot.startToken)){acknowledged.add(snapshot.startToken);room.send('arena_ready',{raceId:snapshot.raceId,startToken:snapshot.startToken});}});room.onMessage('room_error',error=>state.errors.push(error));room.onMessage('result',result=>state.results.push(result));room.onMessage('pong',()=>{});room.onError(()=>{});room.send('sync');return state;}
 try{
  await change('kaze',{locked:false});await services.economy.saveLoadout(bob.user.id,{carId:'kaze'});await pay({carId:'kaze',rimId:'stock',rimColor:'#ccbbaa',stockRimPainted:true});const hostLoadout=(await services.economy.getProfile(alice.user.id)).loadout,peerLoadout=(await services.economy.getProfile(bob.user.id)).loadout;
  const bad=await sdk(bob);await assert.rejects(bad.client.create('race',{ticket:bad.ticket,maxHumans:1,bots:0,loadout:{...peerLoadout,stripeId:'heritage'}}));
  const badStock=await sdk(bob);await assert.rejects(badStock.client.create('race',{ticket:badStock.ticket,maxHumans:1,bots:0,loadout:{...peerLoadout,stockRimPainted:true}}));
  const a=await sdk(alice),host=await a.client.create('race',{ticket:a.ticket,maxHumans:2,bots:0,laps:1,loadout:hostLoadout}),hs=observe(host),b=await sdk(bob),peer=await b.client.joinById(host.roomId,{ticket:b.ticket,loadout:peerLoadout}),ps=observe(peer);
  const ready=async()=>{host.send('ready',{ready:true,assetsLoaded:true});peer.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>hs.snapshot?.members.every(m=>m.ready)===true,'both ready');};
  await waitFor(()=>hs.snapshot?.members.length===2,'both joined');await change('kaze',{locked:true});await ready();host.send('start');await waitFor(()=>hs.errors.some(e=>e.code==='START_FAILED')&&ps.errors.some(e=>e.code==='START_FAILED')&&hs.snapshot?.phase==='lobby','relock notifies host and affected peer');
  const safe=await services.economy.getProfile(bob.user.id);assert.equal(safe.loadout.carId,'brz');peer.send('loadout',safe.loadout);await waitFor(()=>hs.snapshot?.members.find(m=>m.id===peer.sessionId)?.loadout.carId==='brz','peer restores safe saved car');assert.equal((await services.economy.getProfile(bob.user.id)).wallet.balance,'25000');
  await change('kaze',{locked:false});await services.economy.saveLoadout(bob.user.id,{carId:'kaze'});peer.send('loadout',(await services.economy.getProfile(bob.user.id)).loadout);await waitFor(()=>hs.snapshot?.members.find(m=>m.id===peer.sessionId)?.loadout.carId==='kaze','newly unlocked selection');await ready();host.send('start');await waitFor(()=>hs.snapshot?.phase==='racing','race start');const frozen=structuredClone(hs.snapshot!.racers.map(r=>r.loadout));assert.equal(hs.snapshot!.racers.find(r=>r.id===host.sessionId)!.loadout.stockRimPainted,true);assert.equal(hs.snapshot!.racers.find(r=>r.id===host.sessionId)!.loadout.rimColor,'#ccbbaa');
  await change('kaze',{locked:true});await pay({carId:'brz',color:'#102030',stripeId:'circuit',stripeColor:'#ffffff'});await delay(100);
  assert.equal(hs.snapshot!.phase,'racing');assert(hs.snapshot!.racers.every(r=>r.connected&&!r.dnf));assert.deepEqual(hs.snapshot!.racers.map(r=>r.loadout),frozen,'Started race cosmetics/access stay frozen');
  await waitFor(()=>hs.results.length>0,'bounded race settlement');assert.equal(hs.results[0].reward.amount,'0');assert.equal((await services.economy.getProfile(bob.user.id)).loadout.carId,'brz');
 }finally{for(const room of opened){room.reconnection.enabled=false;if(room.connection.isOpen)await room.leave().catch(()=>{});}await server.gracefullyShutdown(false);}
});
