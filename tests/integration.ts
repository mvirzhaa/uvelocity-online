/** Full adapter integration. Run with:
 * node tests/with-postgres.mjs tests/integration.ts
 * After building the client, set INTEGRATION_STATIC=1 to verify served artifacts.
 * This uses real PostgreSQL, HTTP cookies/CSRF and actual Colyseus SDK sockets.
 * No browser, fabricated persistence adapter or client-supplied finish is used.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer as createPortReservation } from 'node:net';
import { access } from 'node:fs/promises';
import { Client, type Room } from '@colyseus/sdk';
import { createApplication } from '../server/index.js';
import type { Catalog, Profile, Loadout } from '../client/src/api.js';
import type { FrozenLoadout, RaceResult, RaceSettlement, RoomSnapshot } from '../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString,'TEST_DATABASE_URL is required; run through tests/with-postgres.mjs.');
assert(/test/i.test(new URL(connectionString).pathname),'Refusing to test against a database whose name does not contain "test".');
const staticArtifacts=process.env.INTEGRATION_STATIC==='1';
if(staticArtifacts)await access('dist/client/index.html');
const port=await new Promise<number>((resolve,reject)=>{
  const reservation=createPortReservation();reservation.once('error',reject);reservation.listen(0,'127.0.0.1',()=>{
    const address=reservation.address();assert(address&&typeof address==='object');reservation.close(error=>error?reject(error):resolve(address.port));
  });
});
const origin=`http://127.0.0.1:${port}`;
const application=await createApplication({databaseUrl:connectionString,allowedOrigins:[origin],secureCookies:false,serveClient:staticArtifacts,development:false,
  prayerNow:()=>new Date('2026-11-20T03:00:00.000Z'),
  realtime:{countdownMs:100,snapshotRateMs:25,reconnectSeconds:1,sessionCheckMs:100,maxRaceDurationMs:3500,finishRetentionMs:4000}});
let steps=0;
const opened:Room[]=[];
interface Actor {email:string;password:string;cookie?:string;csrf?:string;id?:string}
interface HttpResult<T=any>{response:Response;data:T}
interface Observer {room:Room;snapshot:RoomSnapshot|null;errors:Array<{code:string;message:string}>;results:Array<{result:RaceResult;reward:RaceSettlement['rewards'][number]|null}>;left:boolean}
const suffix=randomUUID().slice(0,10);
const alice:Actor={email:`adapter-a-${suffix}@example.test`,password:randomBytes(24).toString('base64url')};
const bob:Actor={email:`adapter-b-${suffix}@example.test`,password:randomBytes(24).toString('base64url')};
const operator:Actor={email:`operator-${suffix}@example.test`,password:randomBytes(24).toString('base64url')};
let catalog:Catalog,aliceProfile:Profile,bobProfile:Profile,initialRoom:Observer,peerRoom:Observer,frozenVersion:string,raceId:string,pendingAppearanceQuote:string;

async function http<T=any>(path:string,options:{actor?:Actor;method?:string;body?:unknown;expected?:number;key?:string;cookie?:string}={}):Promise<HttpResult<T>> {
  const method=options.method??'GET',headers:Record<string,string>={Accept:'application/json',Origin:origin};
  if(method!=='GET'){headers['Content-Type']='application/json';if(options.actor?.csrf)headers['X-CSRF-Token']=options.actor.csrf;}
  const cookie=options.cookie??options.actor?.cookie;if(cookie)headers.Cookie=cookie;
  if(options.key)headers['Idempotency-Key']=options.key;
  const response=await fetch(origin+'/api'+path,{method,headers,...(method!=='GET'?{body:JSON.stringify(options.body??{})}:{})});
  const data=await response.json() as any;
  assert.equal(response.status,options.expected??200,`${method} ${path}: unexpected status ${response.status}, error code ${data.error?.code??'none'}`);
  if(options.actor){
    const setCookie=response.headers.get('set-cookie');
    if(setCookie)options.actor.cookie=setCookie.split(';')[0];
    if(typeof data.csrfToken==='string')options.actor.csrf=data.csrfToken;
    if(data.user?.id)options.actor.id=data.user.id;
  }
  return {response,data};
}
async function step(label:string,work:()=>Promise<void>){
  const started=Date.now();
  try{await work();steps++;console.info(`PASS ${label} (${Date.now()-started}ms)`);}
  catch(error){throw new Error(`${label}: ${error instanceof Error?error.message:'unknown error'}`,{cause:error});}
}
async function waitFor(check:()=>boolean|Promise<boolean>,label:string,timeout=8000){
  const deadline=Date.now()+timeout;
  while(!await check()){if(Date.now()>deadline)throw new Error(`Timed out waiting for ${label}`);await new Promise(resolve=>setTimeout(resolve,15));}
}
function observe(room:Room):Observer {
  opened.push(room);room.reconnection.enabled=false;
  const observer:Observer={room,snapshot:null,errors:[],results:[],left:false};
  const acknowledged=new Set<string>();
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{observer.snapshot=snapshot;
    // Explicit headless arena participant; it must receive the frozen loading
    // scene/token before acknowledging. It cannot bypass with lobby ready alone.
    if(snapshot.phase==='loading'&&snapshot.startToken&&snapshot.racers.length&&!acknowledged.has(snapshot.startToken)){acknowledged.add(snapshot.startToken);room.send('arena_ready',{raceId:snapshot.raceId,startToken:snapshot.startToken});}
  });
  room.onMessage('room_error',error=>observer.errors.push(error));
  room.onMessage('result',result=>observer.results.push(result));
  room.onMessage('pong',()=>{});room.onError(()=>{});room.onLeave(()=>{observer.left=true;});room.send('sync');
  return observer;
}
function sdk(actor:Actor){assert(actor.cookie);return new Client(origin,{headers:{cookie:actor.cookie,origin}});}
async function ticket(actor:Actor){return (await http<{ticket:string;expiresAt:string}>('/race/ticket',{actor,method:'POST'})).data.ticket;}

try {
  await application.listen(port,'127.0.0.1');
  await step('root application boots migrations and real PostgreSQL health',async()=>{
    const health=await http('/health');assert.equal(health.data.application,'UVelocity');assert.equal(health.data.database,'postgresql');assert.equal(health.data.ok,true);
    assert.equal(health.response.headers.get('x-powered-by'),null);
    assert.match(health.response.headers.get('content-security-policy')??'',/frame-ancestors 'self'/);
    const migrated=await application.pool.query('SELECT count(*)::int AS n FROM schema_migrations');assert.equal(migrated.rows[0].n,13);
    const db=await application.pool.query('SELECT version()');assert.match(db.rows[0].version,/PostgreSQL/);
  });

  await step('HTTP account registration, cookie rotation, CSRF and profile contracts',async()=>{
    const anonymous=await http('/auth/me');assert.equal(anonymous.data.user,null);assert.equal(anonymous.data.csrfToken,null);
    const registered=await http('/auth/register',{actor:alice,method:'POST',expected:201,body:{email:alice.email,displayName:'Adapter Driver A',password:alice.password,role:'admin',balance:'999999'}});
    assert.equal(registered.data.user.role,'player');assert.match(registered.response.headers.get('set-cookie')??'',/HttpOnly/i);
    const previousCookie=alice.cookie;
    await http('/auth/register',{actor:bob,method:'POST',expected:201,body:{email:bob.email,displayName:'Adapter Driver B',password:bob.password}});
    await http('/auth/login',{actor:alice,method:'POST',body:{email:alice.email,password:alice.password}});
    assert.notEqual(alice.cookie,previousCookie,'Login rotates the opaque session');
    assert.equal((await http('/auth/me',{cookie:previousCookie})).data.user,null,'Replaced browser session is revoked');
    await http('/profile',{actor:alice,method:'PATCH',body:{displayName:'Adapter Pilot A',avatarId:'driver-4'}});
    aliceProfile=(await http<Profile>('/profile',{actor:alice})).data;bobProfile=(await http<Profile>('/profile',{actor:bob})).data;
    assert.equal(aliceProfile.wallet.balance,'25000');assert.equal(aliceProfile.user.avatarId,'driver-4');assert.equal(aliceProfile.user.displayName,'Adapter Pilot A');
    assert.deepEqual(aliceProfile.inventory,{cars:['brz'],wheels:['stock']});
    await http('/admin/users',{actor:alice,expected:403});
  });

  await step('HTTP purchase headers and workshop loadout preserve owned rim paint',async()=>{
    catalog=(await http<Catalog>('/catalog')).data;assert.equal(catalog.cars.length,16);assert.equal(catalog.wheels.length,4);
    const wheel=catalog.wheels.find(item=>item.id==='six-spoke')!;assert(wheel);
    const payload={itemId:wheel.itemId,catalogVersion:wheel.catalogVersion},key=randomUUID();
    const purchase=await http('/shop/purchase',{actor:alice,method:'POST',body:payload,key});
    const replay=await http('/shop/purchase',{actor:alice,method:'POST',body:payload,key});assert.equal(replay.data.purchaseId,purchase.data.purchaseId);
    assert.equal(purchase.data.wallet.balance,'5000');
    const loadout:Loadout={carId:'brz',rimId:'six-spoke',color:'#8B5A2B',rimColor:'#DDAA66',finish:'matte',stripeId:'twin-racing',stripeColor:'#ffffff'};
    const saved=await http('/loadout',{actor:alice,method:'PUT',body:{carId:'brz',rimId:'six-spoke'}});assert.equal(saved.data.loadout.rimColor,'#c7cdd4');
    await http('/loadout',{actor:alice,method:'PUT',body:loadout,expected:403});
    const quoted=await http('/garage/appearance/quote',{actor:alice,method:'POST',body:loadout});pendingAppearanceQuote=quoted.data.quoteId;assert.equal(quoted.data.total,'30000');assert.equal(quoted.data.affordable,false);
    const unfunded=await http('/garage/appearance/apply',{actor:alice,method:'POST',key:'adapter-paint-'+suffix,body:{quoteId:pendingAppearanceQuote},expected:409});assert.equal(unfunded.data.error.code,'INSUFFICIENT_BALANCE');
    aliceProfile=(await http<Profile>('/profile',{actor:alice})).data;assert(aliceProfile.inventory.wheels.includes('six-spoke'));assert.equal(aliceProfile.wallet.balance,'5000');assert.equal(aliceProfile.loadout.color,'#2866b8');
    const history=await http('/wallet/transactions?limit=10',{actor:alice});assert(history.data.entries.some((entry:any)=>entry.kind==='purchase'&&entry.delta==='-20000'));
  });

  await step('explicit operator account drives real HTTP topup, pricing, tuning and rewards',async()=>{
    await application.services.accounts.createAdmin({email:operator.email,displayName:'Integration Operator',password:operator.password});
    await http('/auth/login',{actor:operator,method:'POST',body:{email:operator.email,password:operator.password}});
    const searched=await http('/admin/users?q='+encodeURIComponent(alice.email),{actor:operator});assert.equal(searched.data.users.length,1);assert.equal(searched.data.users[0].userId,alice.id);
    const grant=await http('/admin/topups',{actor:operator,method:'POST',key:randomUUID(),body:{userId:alice.id,amount:'75000',reference:'adapter-grant-'+suffix,reason:'HTTP integration virtual-credit grant'}});assert.equal(grant.data.wallet.balance,'80000');
    const applied=await http('/garage/appearance/apply',{actor:alice,method:'POST',key:'adapter-paint-'+suffix,body:{quoteId:pendingAppearanceQuote}});
    const repeated=await http('/garage/appearance/apply',{actor:alice,method:'POST',key:'adapter-paint-'+suffix,body:{quoteId:pendingAppearanceQuote}});assert.equal(repeated.data.applicationId,applied.data.applicationId);assert.equal(applied.data.wallet.balance,'50000');
    aliceProfile=(await http<Profile>('/profile',{actor:alice})).data;assert.equal(aliceProfile.loadout.rimColor,'#ddaa66');assert.equal(aliceProfile.loadout.color,'#8b5a2b');assert.equal(aliceProfile.loadout.stripeId,'twin-racing');
    const before=await http('/admin/tuning',{actor:operator});
    const published=await http('/admin/tuning/publish',{actor:operator,method:'POST',body:{expectedVersion:before.data.version,carId:'brz',topSpeed:260,zeroTo100:5.5,handling:1.2,reason:'HTTP integration tuning publication'}});
    const rewards=await http('/admin/rewards/publish',{actor:operator,method:'POST',body:{expectedVersion:published.data.version,reason:'HTTP integration reward publication',rewardPolicy:{finish:'12000',perLap:'1500',podium:['15000','8000','4000'],minimumDurationMs:15000,maximum:'50000'}}});frozenVersion=rewards.data.version;
    const mesh=catalog.wheels.find(item=>item.id==='mesh')!;
    await http('/admin/catalog/mesh',{actor:operator,method:'PATCH',body:{price:'45000',enabled:true,expectedVersion:mesh.catalogVersion,reason:'HTTP integration catalog update'}});
    catalog=(await http<Catalog>('/catalog')).data;
    assert.equal(catalog.rulesetVersion,frozenVersion);assert.equal(catalog.cars.find(car=>car.id==='brz')?.topSpeed,260);assert.equal(catalog.wheels.find(wheel=>wheel.id==='mesh')?.price,'45000');
    const audit=await http('/admin/audit?limit=50',{actor:operator});
    for(const action of ['wallet.topup','catalog.updated','ruleset.published'])assert(audit.data.entries.some((entry:any)=>entry.action===action));
  });

  await step('real Colyseus SDK joins a private room using HTTP-issued session tickets',async()=>{
    initialRoom=observe(await sdk(alice).create('race',{ticket:await ticket(alice),circuit:'city',laps:1,bots:0,maxHumans:2,difficulty:'normal',collisionMode:'solid',loadout:aliceProfile.loadout}));
    await waitFor(()=>initialRoom.snapshot?.members.length===1,'host lobby snapshot');
    const invite=initialRoom.snapshot!.inviteCode;
    await http('/rooms/'+invite,{expected:401});
    const lookup=await http('/rooms/'+invite,{actor:bob});assert.equal(lookup.data.roomId,initialRoom.room.roomId);assert.equal(lookup.data.joinable,true);
    peerRoom=observe(await sdk(bob).joinById(lookup.data.roomId,{ticket:await ticket(bob),loadout:bobProfile.loadout}));
    await waitFor(()=>initialRoom.snapshot?.members.length===2&&peerRoom.snapshot?.members.length===2,'both participants');
    const remote=peerRoom.snapshot!.members.find(member=>member.userId===alice.id)!;
    assert.equal(remote.name,'Adapter Pilot A');assert.equal(remote.loadout.rimId,'six-spoke');assert.equal(remote.loadout.rimColor,'#ddaa66');assert.equal(remote.loadout.color,'#8b5a2b');assert.equal(remote.loadout.stripeId,'twin-racing');assert.equal(remote.loadout.stripeColor,'#ffffff');
    assert.equal(remote.loadout.stats.topSpeed,260);
    const serialized=JSON.stringify(peerRoom.snapshot);assert(!serialized.includes(alice.cookie!),'Session cookie must stay out of snapshots');assert(!serialized.includes(alice.csrf!),'CSRF token must stay out of snapshots');
    initialRoom.room.send('start');await waitFor(()=>initialRoom.errors.some(error=>error.code==='NOT_READY'),'asset readiness barrier');
    peerRoom.room.send('start');await waitFor(()=>peerRoom.errors.some(error=>error.code==='HOST_ONLY'),'host-only start');
  });

  await step('readiness, authoritative start and live ruleset freeze cross all adapters',async()=>{
    initialRoom.room.send('ready',{ready:true,assetsLoaded:true});peerRoom.room.send('ready',{ready:true,assetsLoaded:true});
    await waitFor(()=>initialRoom.snapshot?.members.every(member=>member.ready&&member.assetsLoaded)===true,'ready acknowledgement');
    initialRoom.room.send('start');await waitFor(()=>initialRoom.snapshot?.phase==='racing'&&peerRoom.snapshot?.phase==='racing','shared countdown completion');
    raceId=initialRoom.snapshot!.raceId!;assert(raceId);assert.equal(initialRoom.snapshot!.startAt,peerRoom.snapshot!.startAt);assert.equal(initialRoom.snapshot!.rulesetVersion,frozenVersion);
    const own=initialRoom.snapshot!.racers.find(racer=>racer.userId===alice.id)!;assert.equal(own.loadout.rimColor,'#ddaa66');
    initialRoom.room.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:false,x:999999});
    await waitFor(()=>{const racer=initialRoom.snapshot?.racers.find(racer=>racer.userId===alice.id);return !!racer&&racer.lastProcessedSeq===1&&racer.speed>0;},'authoritative motion');
    assert(initialRoom.snapshot!.racers.every(racer=>Number.isFinite(racer.x)&&Math.abs(racer.x)<10000));
    await http('/admin/tuning/publish',{actor:operator,method:'POST',body:{expectedVersion:frozenVersion,carId:'brz',topSpeed:270,zeroTo100:5.4,handling:1.22,reason:'Publish while an actual SDK race is running'}});
    initialRoom.room.send('sync');await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(initialRoom.snapshot!.rulesetVersion,frozenVersion);assert(initialRoom.snapshot!.racers.every(racer=>racer.loadout.stats.topSpeed===260));
    const current=await http<Catalog>('/catalog');assert.notEqual(current.data.rulesetVersion,frozenVersion);assert.equal(current.data.cars.find(car=>car.id==='brz')?.topSpeed,270);
  });

  await step('bounded server race produces private DNF settlement and durable PostgreSQL results',async()=>{
    try{await waitFor(()=>initialRoom.results.length>=1&&peerRoom.results.length>=1,'real room settlement',10000);}
    catch(error){throw new Error(`${messageOf(error)}; diagnostics=${JSON.stringify({host:{phase:initialRoom.snapshot?.phase,tick:initialRoom.snapshot?.tick,elapsed:initialRoom.snapshot?.elapsedMs,results:initialRoom.results.length,error:initialRoom.snapshot?.settlementError,codes:initialRoom.errors.map(e=>e.code)},peer:{phase:peerRoom.snapshot?.phase,tick:peerRoom.snapshot?.tick,elapsed:peerRoom.snapshot?.elapsedMs,results:peerRoom.results.length,error:peerRoom.snapshot?.settlementError,codes:peerRoom.errors.map(e=>e.code)}})}`);}
    assert.equal(initialRoom.results[0]!.result.raceId,raceId);assert.equal(initialRoom.results[0]!.reward?.userId,alice.id);assert.equal(peerRoom.results[0]!.reward?.userId,bob.id);
    assert.equal(initialRoom.results[0]!.reward?.amount,'0');assert.equal(initialRoom.results[0]!.reward?.balance,'50000');
    assert(initialRoom.results[0]!.result.participants.every(participant=>participant.status==='dnf'));
    assert(!('rewards' in initialRoom.results[0]!),'A client must not receive other account balances');
    const stored=await application.pool.query('SELECT r.status,s.version,(SELECT count(*)::int FROM race_results rr WHERE rr.race_id=r.id) AS results FROM races r JOIN rulesets s ON s.id=r.ruleset_id WHERE r.id=$1',[raceId]);
    assert.equal(stored.rows[0].status,'finished');assert.equal(String(stored.rows[0].version),frozenVersion);assert.equal(stored.rows[0].results,2);
    const profile=await http<Profile>('/profile',{actor:alice});assert.equal(profile.data.statistics.races,1);assert.equal(profile.data.statistics.rewards,'0');assert.equal(profile.data.wallet.balance,'50000');
    await initialRoom.room.leave();await peerRoom.room.leave();
  });

  await step('Panther HTTP purchase and saved factory loadout enter an actual SDK race and respond to input',async()=>{
    const fresh=(await http<Catalog>('/catalog')).data,panther=fresh.cars.find(car=>car.id==='panther-grand-touring');assert(panther);
    assert.equal(panther.price,'150000');assert.equal(panther.locked,true);assert.equal(panther.color,'#19252e');
    assert.deepEqual(panther.stats,{topSpeed:170,zeroTo100:10.8,handling:.88});assert.equal(panther.tuningVersion,fresh.rulesetVersion);
    const before=(await http<Profile>('/profile',{actor:bob})).data;
    const grant=await http('/admin/topups',{actor:operator,method:'POST',key:randomUUID(),body:{userId:bob.id,amount:panther.price,reference:'adapter-panther-'+suffix,reason:'Panther realtime adapter purchase fixture'}});
    assert.equal(BigInt(grant.data.wallet.balance)-BigInt(before.wallet.balance),150000n);
    const purchase=await http('/shop/purchase',{actor:bob,method:'POST',key:randomUUID(),body:{itemId:panther.itemId,catalogVersion:panther.catalogVersion}});
    assert.equal(purchase.data.itemId,panther.id);assert.equal(purchase.data.pricePaid,panther.price);assert.equal(purchase.data.wallet.balance,before.wallet.balance);
    await http('/loadout',{actor:bob,method:'PUT',body:{carId:panther.id,rimId:'stock'}});
    bobProfile=(await http<Profile>('/profile',{actor:bob})).data;assert(bobProfile.inventory.cars.includes(panther.id));assert.equal(bobProfile.wallet.balance,before.wallet.balance);
    const factory={carId:'panther-grand-touring',rimId:'stock',color:'#19252e',finish:'metallic',rimColor:'#c7cdd4',stockRimPainted:false,stripeId:'none',stripeColor:'#ffffff'} as const;
    const assertFactory=(loadout:Pick<FrozenLoadout,keyof typeof factory>)=>{for(const key of Object.keys(factory) as Array<keyof typeof factory>)assert.equal(loadout[key],factory[key],`Panther saved ${key}`);};
    assertFactory(bobProfile.loadout);
    const observer=observe(await sdk(bob).create('race',{ticket:await ticket(bob),circuit:'city',laps:1,bots:0,maxHumans:1,difficulty:'normal',collisionMode:'solid',loadout:bobProfile.loadout}));
    try{
      await waitFor(()=>observer.snapshot?.members.length===1,'Panther admitted to lobby');
      const member=observer.snapshot!.members.find(entry=>entry.userId===bob.id);assert(member);assertFactory(member.loadout);assert.deepEqual(member.loadout.stats,panther.stats);
      observer.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>observer.snapshot?.members.every(entry=>entry.ready&&entry.assetsLoaded)===true,'Panther ready acknowledgement');
      observer.room.send('start');await waitFor(()=>observer.snapshot?.phase==='racing','Panther arena barrier and countdown');
      assert.equal(observer.snapshot!.rulesetVersion,fresh.rulesetVersion);
      const racer=observer.snapshot!.racers.find(entry=>entry.userId===bob.id);assert(racer);assertFactory(racer.loadout);assert.deepEqual(racer.loadout.stats,panther.stats);assert.equal(racer.loadout.tuningVersion,fresh.rulesetVersion);
      const start={x:racer.x,z:racer.z};
      observer.room.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:false});
      await waitFor(()=>{const current=observer.snapshot?.racers.find(entry=>entry.userId===bob.id);return !!current&&current.lastProcessedSeq===1&&current.speed>0&&Math.hypot(current.x-start.x,current.z-start.z)>.01;},'Panther authoritative movement');
      assert.deepEqual(observer.errors,[]);
    }finally{
      if(observer.room.connection.isOpen)await observer.room.leave();
    }
  });

  await step('logout revokes HTTP session, outstanding race ticket and active SDK connection',async()=>{
    const client=sdk(alice),oldCookie=alice.cookie!,issuedBeforeLogout=await ticket(alice);
    const observer=observe(await client.create('race',{ticket:await ticket(alice),circuit:'city',laps:1,bots:0,maxHumans:1,loadout:aliceProfile.loadout}));
    observer.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>observer.snapshot?.members.every(member=>member.ready)===true,'logout-race readiness');observer.room.send('start');await waitFor(()=>observer.snapshot?.phase==='racing','logout-race start');
    assert.equal(observer.snapshot!.racers[0]!.loadout.stats.topSpeed,270,'New races receive the newly published tuning');
    const reconnectToken=observer.room.reconnectionToken;
    await http('/auth/logout',{actor:alice,method:'POST'});
    assert.equal((await http('/auth/me',{cookie:oldCookie})).data.user,null);
    await http('/race/ticket',{actor:{...alice,cookie:oldCookie},method:'POST',expected:401});
    await waitFor(()=>observer.errors.some(error=>error.code==='SESSION_EXPIRED')&&observer.left,'active socket revocation');
    await assert.rejects(client.reconnect(reconnectToken));
    await assert.rejects(client.create('race',{ticket:issuedBeforeLogout,circuit:'city',laps:1,bots:0,maxHumans:1,loadout:aliceProfile.loadout}));
    await waitFor(async()=>{const row=await application.pool.query('SELECT status FROM races WHERE id=$1',[observer.snapshot!.raceId]);return row.rows[0]?.status==='finished';},'revoked player DNF persistence');
  });

  if(staticArtifacts)await step('production HTTP routes serve React shell, game iframe, branding and all16 GLB assets',async()=>{
    const shell=await fetch(origin+'/');assert.equal(shell.status,200);assert.match(shell.headers.get('content-type')??'',/text\/html/);assert.match(await shell.text(),/UVelocity/);
    const frame=await fetch(origin+'/game/game.html');assert.equal(frame.status,200);const frameHtml=await frame.text();assert.match(frameHtml,/game-api\.js/);
    assert(!/\son[a-z]+\s*=/i.test(frameHtml),'Production game HTML must bind events in external scripts; inline handlers are blocked by its CSP');
    assert(!/script-src[^;]*'unsafe-inline'/.test(frame.headers.get('content-security-policy')??''),'Production script CSP must remain restricted to external scripts');
    for(const name of ['uvelocity-logo.png','uika-logo-transparent.png','informatika-uika-logo.png']){
      const brand=await fetch(origin+'/branding/'+name,{method:'HEAD'});assert.equal(brand.status,200,name);assert.match(brand.headers.get('content-type')??'',/image\/png/);
    }
    assert.match(frameHtml,/cockpit\.js/,'The production frame includes the fitted dashboard module');
    const cockpit=await fetch(origin+'/game/cockpit.js');assert.equal(cockpit.status,200);assert.match(cockpit.headers.get('content-type')??'',/javascript/);
    const presentation=await http('/presentation');assert.equal(presentation.data.version,1);assert.equal(presentation.data.garageMusic,null);assert.equal(presentation.data.loadingImage,null);
    for(const car of catalog.cars){
      const glb=await fetch(origin+`/game/assets/cars/${car.id}.glb`,{headers:{Range:'bytes=0-11'}});assert.equal(glb.status,206,`GLB range route ${car.id}`);
      const header=Buffer.from(await glb.arrayBuffer());assert.equal(header.toString('ascii',0,4),'glTF');assert.equal(header.readUInt32LE(4),2);assert(header.readUInt32LE(8)>1000);
    }
    const missing=await http('/route-that-does-not-exist',{expected:404});assert.equal(missing.data.error.code,'NOT_FOUND');
  });

  console.info(`Integration complete: ${steps} end-to-end checks passed with real HTTP, native PostgreSQL and Colyseus SDK clients${staticArtifacts?', including built static artifacts':''}.`);
} catch(error) {
  process.exitCode=1;
  console.error('FAIL '+messageOf(error));
} finally {
  for(const room of opened){room.reconnection.enabled=false;if(room.connection.isOpen)await room.leave().catch(()=>{});}
  await application.close();
}

function messageOf(error:unknown):string{return error instanceof Error?error.message:'Unknown failure';}
