import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {after,before,test} from 'node:test';
import pg from 'pg';
import {Server,matchMaker} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {migrate} from '../../db/migrate.js';
import {createServices,type BackendServices} from '../index.js';
import type {AuthResult,PublicUser} from '../accounts.js';
import {registerRaceRooms} from '../../realtime/RaceRoom.js';
import {CAR_IDS,type BeginRaceInput,type CarId,type FrozenLoadout,type RoomSnapshot} from '../../../shared/types.js';

const connectionString=process.env.TEST_DATABASE_URL;
assert(connectionString&&/test/i.test(new URL(connectionString).pathname),'Use the isolated native PostgreSQL wrapper.');
const schema=`uv_race_categories_${process.pid}`,control=new pg.Pool({connectionString,max:2});
const family=['honda-crv-rs','mitsubishi-pajero-sport','toyota-fortuner','toyota-innova-zenix'] as const;
const iconic=['batmobile-tumbler','knight-rider-kitt'] as const;
const expanded=[...family,...iconic] as const;
const reason='Category race integration fixture',password='Vehicle-Race-Fixture-2026!';
let pool:pg.Pool,services:BackendServices,admin:PublicUser,owner:AuthResult,peer:AuthResult,visitor:AuthResult;
let server:Server,endpoint:string,registry:ReturnType<typeof registerRaceRooms>;
const opened:Room[]=[],begun=new Map<string,BeginRaceInput>();
const isCode=(code:string)=>(error:unknown)=>(error as {code?:string})?.code===code;
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string,timeout=6000){const until=Date.now()+timeout;while(!check()){if(Date.now()>until)throw new Error('Timeout: '+label);await delay(10);}}
async function offer(id:CarId){return(await services.economy.getCatalog()).cars.find(car=>car.id===id)!;}
async function edit(id:CarId,body:Record<string,unknown>){const current=await offer(id);return services.admin.updateCatalog(admin.id,id,{...body,expectedVersion:current.catalogVersion,reason});}
async function sdk(user:AuthResult){
  const headers={cookie:'uv_session='+user.sessionToken},session=await services.accounts.authenticateSession(headers);assert(session);
  return{client:new Client(endpoint,{headers}),ticket:(await services.accounts.issueRaceTicket(session)).ticket};
}
async function equip(user:AuthResult,id:CarId){await services.economy.saveLoadout(user.user.id,{carId:id});return services.economy.resolveLoadout(user.user.id);}
interface Observed {room:Room;snapshot?:RoomSnapshot;errors:Array<{code:string;message:string}>}
function observe(room:Room,autoAck=true):Observed{
  opened.push(room);room.reconnection.enabled=false;const state:Observed={room,errors:[]},acknowledged=new Set<string>();
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{state.snapshot=snapshot;if(autoAck&&snapshot.phase==='loading'&&snapshot.startToken&&snapshot.racers.length&&!acknowledged.has(snapshot.startToken)){acknowledged.add(snapshot.startToken);room.send('arena_ready',{raceId:snapshot.raceId,startToken:snapshot.startToken});}});
  room.onMessage('room_error',error=>state.errors.push(error));room.onMessage('result',()=>{});room.onMessage('pong',()=>{});room.onError(()=>{});room.send('sync');return state;
}
async function ready(states:Observed[]){for(const state of states)state.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>states[0]!.snapshot?.members.every(member=>member.ready)===true,'participants ready');}

before(async()=>{
  await control.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:10});assert.equal((await migrate(pool)).length,16);
  services=createServices(pool,{prayerNow:()=>new Date('2026-11-20T03:00:00Z')});
  admin=await services.accounts.createAdmin({email:'category-admin@example.test',displayName:'Category Admin',password});
  owner=await services.accounts.register({email:'category-owner@example.test',displayName:'Category Owner',password});
  peer=await services.accounts.register({email:'category-peer@example.test',displayName:'Category Peer',password});
  visitor=await services.accounts.register({email:'category-visitor@example.test',displayName:'Category Visitor',password});
  for(const user of[owner,peer])await services.admin.topup(admin.id,{userId:user.user.id,amount:'6000000',reference:'category-grant-'+user.user.id,reason},'category-grant-'+user.user.id);
  for(const id of expanded){const car=await offer(id);await services.economy.purchase(owner.user.id,{itemId:id,catalogVersion:car.catalogVersion},'category-buy-'+id);
    const quote=await services.economy.quoteAppearance(owner.user.id,{carId:id,color:'#365a77',rimId:'stock',rimColor:'#c4ad72',stockRimPainted:true,stripeId:'twin-racing',stripeColor:'#eeeeee'});await services.economy.applyAppearance(owner.user.id,{quoteId:quote.quoteId},'category-paint-'+id);}
  await services.economy.purchase(peer.user.id,{itemId:'mitsubishi-pajero-sport',catalogVersion:(await offer('mitsubishi-pajero-sport')).catalogVersion},'category-peer-buy');
  await services.economy.purchase(peer.user.id,{itemId:'batmobile-tumbler',catalogVersion:(await offer('batmobile-tumbler')).catalogVersion},'category-peer-tumbler');
  const http=createServer();server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  registry=registerRaceRooms(server,{
    consumeRaceTicket:input=>services.accounts.consumeRaceTicket(input),authenticate:headers=>services.accounts.authenticateSession(headers),gameplayAccess:userId=>services.prayer.status(userId),
    resolveLoadout:(userId,selection,version)=>services.economy.resolveLoadout(userId,selection,version),resolveVehicleRestriction:categoryId=>services.economy.resolveVehicleRestriction(categoryId),getActiveRuleset:()=>services.economy.getActiveRuleset(),
    async beginRace(input){await services.economy.beginRace(input);begun.set(input.raceId,structuredClone(input));},finalizeRace:result=>services.economy.finalizeRace(result),abortRace:id=>services.economy.abortRace(id),
  },{countdownMs:60,snapshotRateMs:20,reconnectSeconds:1,finishRetentionMs:250,sessionCheckMs:2000,maxRaceDurationMs:20000});
  await server.listen(0,'127.0.0.1');const address=http.address();assert(address&&typeof address==='object');endpoint='http://127.0.0.1:'+address.port;
});
after(async()=>{
  for(const room of opened)if(room.connection.isOpen)await room.leave().catch(()=>{});
  if(server)await server.gracefullyShutdown(false);if(pool)await pool.end();await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await control.end();
});

test('category resolver captures canonical models and includes purchased or admin-free cars independently of the sale toggle',async()=>{
  assert.deepEqual((await services.economy.resolveVehicleRestriction(null)).allowedCarIds,CAR_IDS);
  assert.deepEqual((await services.economy.resolveVehicleRestriction('suv')).allowedCarIds,family.slice(0,3));
  assert.deepEqual((await services.economy.resolveVehicleRestriction('koleksi-ikonik')).allowedCarIds,iconic);
  assert((await services.economy.resolveVehicleRestriction('mpv')).allowedCarIds.includes('toyota-innova-zenix'));
  await assert.rejects(services.economy.resolveVehicleRestriction('missing'),isCode('VEHICLE_CATEGORY_NOT_FOUND'));
  await assert.rejects(services.economy.resolveVehicleRestriction('SUV?'),isCode('INVALID_CATEGORY'));
  const empty=(await services.admin.createVehicleCategory(admin.id,{name:'Empty race class',reason})).category;
  await assert.rejects(services.economy.resolveVehicleRestriction(empty.id),isCode('VEHICLE_CATEGORY_EMPTY'));
  await edit('toyota-fortuner',{enabled:false,locked:false});
  assert((await services.economy.resolveVehicleRestriction('suv')).allowedCarIds.includes('toyota-fortuner'));
  assert.equal((await equip(visitor,'toyota-fortuner')).carId,'toyota-fortuner');
  await edit('toyota-fortuner',{enabled:true,locked:true});
  await assert.rejects(equip(visitor,'toyota-fortuner'),isCode('CAR_LOCKED'));
  assert.equal((await equip(owner,'toyota-fortuner')).carId,'toyota-fortuner');
  for(const category of['missing',empty.id,'SUV?']){const client=await sdk(owner);await assert.rejects(client.client.create('race',{ticket:client.ticket,vehicleCategoryId:category,maxHumans:1,bots:0,loadout:await equip(owner,'honda-crv-rs')}));}
});

test('all six new purchases equip paid appearances and reach authoritative multiplayer motion with only eligible category bots',{timeout:20000},async()=>{
  for(const id of expanded){
    const loadout=await equip(owner,id),auth=await sdk(owner),category=(iconic as readonly string[]).includes(id)?'koleksi-ikonik':id==='toyota-innova-zenix'?'mpv':'suv';
    const state=observe(await auth.client.create('race',{ticket:auth.ticket,vehicleCategoryId:category,maxHumans:1,bots:3,laps:1,loadout}));
    await waitFor(()=>!!state.snapshot,'new vehicle lobby');await ready([state]);state.room.send('start');await waitFor(()=>state.snapshot?.phase==='racing','new vehicle running');
    const scene=state.snapshot!,own=scene.racers.find(racer=>racer.id===state.room.sessionId)!;
    assert.equal(own.loadout.carId,id);assert.deepEqual(own.loadout,loadout);assert.equal(own.loadout.color,'#365a77');assert.equal(own.loadout.stockRimPainted,true);assert.equal(own.loadout.stripeId,'twin-racing');
    assert(scene.racers.every(racer=>scene.vehicleRestriction!.allowedCarIds.includes(racer.loadout.carId)));
    state.room.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:false});await waitFor(()=>state.snapshot?.racers.find(racer=>racer.id===state.room.sessionId)?.lastProcessedSeq===1,'new vehicle input');
    await waitFor(()=>Number(state.snapshot?.racers.find(racer=>racer.id===state.room.sessionId)?.speed)>0,'new vehicle movement');
    const stored=(await pool.query('SELECT config FROM races WHERE id=$1',[scene.raceId])).rows[0].config;assert.deepEqual(stored.vehicleRestriction,scene.vehicleRestriction);assert.equal(stored.participants.filter((p:any)=>!p.isBot)[0].carId,id);
    await state.room.leave();
  }
});

test('room category admission, explicit loadout changes, ready and start reject wrong cars without granting ownership',{timeout:15000},async()=>{
  const wrong=await sdk(owner);await assert.rejects(wrong.client.create('race',{ticket:wrong.ticket,vehicleCategoryId:'suv',maxHumans:2,bots:0,loadout:await equip(owner,'brz')}),/VEHICLE_CATEGORY_RESTRICTED/);
  const auth=await sdk(owner),loadout=await equip(owner,'honda-crv-rs'),state=observe(await auth.client.create('race',{ticket:auth.ticket,vehicleCategoryId:'suv',allowedCarIds:['brz'],vehicleRestriction:{categoryId:null,allowedCarIds:['brz']},maxHumans:3,bots:0,loadout}));
  try{
    await waitFor(()=>!!state.snapshot,'restricted lobby');assert.deepEqual(state.snapshot!.vehicleRestriction!.allowedCarIds,family.slice(0,3));
    const disallowed=await sdk(visitor);await assert.rejects(disallowed.client.joinById(state.room.roomId,{ticket:disallowed.ticket,loadout:await equip(visitor,'brz')}),/VEHICLE_CATEGORY_RESTRICTED/);
    const unowned=await sdk(visitor);await assert.rejects(unowned.client.joinById(state.room.roomId,{ticket:unowned.ticket,loadout:{carId:'honda-crv-rs',color:'#4b637a',finish:'metallic',rimId:'stock'}}));
    state.room.send('loadout',await equip(owner,'brz'));await waitFor(()=>state.errors.length>0,'wrong category loadout refused');assert.equal(state.errors.at(-1)!.code,'VEHICLE_CATEGORY_RESTRICTED',JSON.stringify(state.errors));assert.equal(state.snapshot!.members[0]!.loadout.carId,'honda-crv-rs');
    state.room.send('loadout',{...loadout,carId:'forged-car'});await waitFor(()=>state.errors.some(error=>error.code==='LOADOUT_REJECTED'),'unknown car refused');
    const valid=await equip(owner,'toyota-fortuner');state.room.send('loadout',valid);await waitFor(()=>state.snapshot?.members[0]?.loadout.carId==='toyota-fortuner','explicit eligible car accepted');
    // Trusted corruption fixture checks the last two guards independently of
    // admission: a mismatched stored selection must never pass ready or start.
    const local=matchMaker.getLocalRoomById(state.room.roomId) as unknown as {members:Map<string,{selection:any;loadout:FrozenLoadout;ready:boolean;assetsLoaded:boolean}>};
    const member=local.members.get(state.room.sessionId)!,original=member.selection;member.selection={...original,carId:'brz'};
    const errors=state.errors.length;state.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>state.errors.length>errors,'ready category guard');assert.equal(state.errors.at(-1)!.code,'VEHICLE_CATEGORY_RESTRICTED');assert.equal(member.ready,false);
    member.ready=true;member.assetsLoaded=true;state.room.send('start');await waitFor(()=>state.errors.length>errors+1,'start category guard');assert.equal(state.errors.at(-1)!.code,'VEHICLE_CATEGORY_RESTRICTED');assert.equal(state.snapshot!.raceId,null);
    member.selection=original;member.ready=false;member.assetsLoaded=false;state.room.send('sync');await waitFor(()=>state.snapshot?.members[0]?.ready===false&&state.snapshot.members[0].assetsLoaded===false,'corruption fixture reset published');await ready([state]);state.room.send('start');await waitFor(()=>state.snapshot?.phase==='racing','valid category retry starts');
    assert.deepEqual((await services.economy.getProfile(visitor.user.id)).inventory.cars,['brz']);
  }finally{await state.room.leave();}
});

test('category rename, reassignment and deletion preserve a room snapshot through join, reconnect and start; persisted whitelist rejects mismatched human or bot cars',{timeout:15000},async()=>{
  const hostAuth=await sdk(owner),host=observe(await hostAuth.client.create('race',{ticket:hostAuth.ticket,vehicleCategoryId:'suv',maxHumans:3,bots:5,laps:1,loadout:await equip(owner,'honda-crv-rs')}));
  await waitFor(()=>!!host.snapshot,'frozen rule captured');const frozen=structuredClone(host.snapshot!.vehicleRestriction!);
  const initial=(await services.economy.getCatalog()).categories.find(category=>category.id==='suv')!;
  const renamed=await services.admin.updateVehicleCategory(admin.id,'suv',{name:'Adventure class',sortOrder:initial.sortOrder,expectedVersion:initial.version,reason});
  assert.equal((await services.economy.resolveVehicleRestriction('suv')).categoryName,'Adventure class');
  for(const id of family.slice(0,3))await edit(id,{categoryId:'special'});
  await services.admin.deleteVehicleCategory(admin.id,'suv',{expectedVersion:renamed.category.version,reason});
  assert.deepEqual(registry.findByCode(host.snapshot!.inviteCode)!.vehicleRestriction,frozen);
  const invalid=await sdk(owner);await assert.rejects(invalid.client.create('race',{ticket:invalid.ticket,vehicleCategoryId:'suv',maxHumans:1,bots:0,loadout:await equip(owner,'honda-crv-rs')}),/VEHICLE_CATEGORY_NOT_FOUND/);
  const peerAuth=await sdk(peer),joined=observe(await peerAuth.client.joinById(host.room.roomId,{ticket:peerAuth.ticket,loadout:await equip(peer,'mitsubishi-pajero-sport')}));
  await waitFor(()=>host.snapshot?.members.length===2,'join after deletion');const token=joined.room.reconnectionToken,id=joined.room.sessionId;joined.room.connection.close(1000);
  await waitFor(()=>host.snapshot?.members.find(member=>member.id===id)?.connected===false,'reconnect drop');
  const restored=observe(await peerAuth.client.reconnect(token));await waitFor(()=>restored.snapshot?.members.find(member=>member.id===id)?.connected===true,'reconnect restored');assert.deepEqual(restored.snapshot!.vehicleRestriction,frozen);
  try{
    await ready([host,restored]);host.room.send('start');await waitFor(()=>host.snapshot?.phase==='racing'&&restored.snapshot?.phase==='racing','frozen category racing');
    assert.equal(host.snapshot!.racers.length,7);assert(host.snapshot!.racers.every(racer=>frozen.allowedCarIds.includes(racer.loadout.carId)));assert.deepEqual(host.snapshot!.vehicleRestriction,frozen);
    const valid=begun.get(host.snapshot!.raceId!)!,balance=(await services.economy.getProfile(owner.user.id)).wallet.balance,brz=await equip(owner,'brz');
    for(const kind of['human','bot','mismatch','missing-rule'] as const){
      const bad=structuredClone(valid);bad.raceId=randomUUID();
      if(kind==='missing-rule')delete bad.vehicleRestriction;
      else{const participant=bad.participants.find(person=>person.isBot===(kind==='bot'))!;participant.carId='brz';if(kind!=='mismatch')participant.loadout=brz;}
      await assert.rejects(services.economy.beginRace(bad),isCode('VEHICLE_CATEGORY_RESTRICTED'));assert.equal((await pool.query('SELECT id FROM races WHERE id=$1',[bad.raceId])).rowCount,0);
    }
    assert.equal((await services.economy.getProfile(owner.user.id)).wallet.balance,balance);
  }finally{await host.room.leave();await restored.room.leave();}
});

test('Koleksi Ikonik admits only purchased collectibles and keeps its captured rule after an operator reassigns one vehicle',{timeout:15000},async()=>{
  const auth=await sdk(owner),host=observe(await auth.client.create('race',{ticket:auth.ticket,vehicleCategoryId:'koleksi-ikonik',circuit:'drag-2km',maxHumans:2,bots:3,loadout:await equip(owner,'knight-rider-kitt')}));
  await waitFor(()=>!!host.snapshot,'iconic lobby');const frozen=structuredClone(host.snapshot!.vehicleRestriction!);
  assert.deepEqual(frozen.allowedCarIds,iconic);assert.equal(frozen.categoryName,'Koleksi Ikonik');
  const blocked=await sdk(visitor);await assert.rejects(blocked.client.joinById(host.room.roomId,{ticket:blocked.ticket,loadout:{carId:'batmobile-tumbler',color:'#202329',finish:'matte',rimId:'stock'}}));
  const other=await sdk(peer);await assert.rejects(other.client.joinById(host.room.roomId,{ticket:other.ticket,loadout:await equip(peer,'mitsubishi-pajero-sport')}),/VEHICLE_CATEGORY_RESTRICTED/);
  const previous=(await services.economy.getCatalog()).categories.find(category=>category.id==='koleksi-ikonik')!;
  await services.admin.updateVehicleCategory(admin.id,previous.id,{name:'Operator film collection',sortOrder:previous.sortOrder,expectedVersion:previous.version,reason});
  await edit('batmobile-tumbler',{categoryId:'special'});
  assert.deepEqual((await services.economy.resolveVehicleRestriction(previous.id)).allowedCarIds,['knight-rider-kitt']);
  assert.deepEqual(registry.findByCode(host.snapshot!.inviteCode)!.vehicleRestriction,frozen);
  const peerAuth=await sdk(peer),joined=observe(await peerAuth.client.joinById(host.room.roomId,{ticket:peerAuth.ticket,loadout:await equip(peer,'batmobile-tumbler')}));
  try{
    await waitFor(()=>host.snapshot?.members.length===2,'iconic purchased peer');await ready([host,joined]);host.room.send('start');
    await waitFor(()=>host.snapshot?.phase==='racing'&&joined.snapshot?.phase==='racing','frozen iconic start');
    const scene=host.snapshot!;assert.equal(scene.config.laps,1);assert.equal(scene.racers.length,5);assert.deepEqual(scene.vehicleRestriction,frozen);
    assert(scene.racers.every(racer=>iconic.includes(racer.loadout.carId as typeof iconic[number])));
    const bots=scene.racers.filter(racer=>racer.isBot);assert.equal(bots.length,3);
    assert.deepEqual(new Set(bots.map(racer=>racer.loadout.carId)),new Set(iconic));
    for(const bot of bots)assert.equal(bot.loadout.finish,bot.loadout.carId==='batmobile-tumbler'?'matte':'gloss');
    assert.equal(scene.racers.find(racer=>racer.userId===owner.user.id)!.loadout.carId,'knight-rider-kitt');
    assert.equal(scene.racers.find(racer=>racer.userId===peer.user.id)!.loadout.carId,'batmobile-tumbler');
    const persisted=(await pool.query('SELECT config FROM races WHERE id=$1',[scene.raceId])).rows[0].config;assert.deepEqual(persisted.vehicleRestriction,frozen);
    assert.deepEqual((await services.economy.getProfile(visitor.user.id)).inventory.cars,['brz']);
  }finally{await host.room.leave();await joined.room.leave();}
});
