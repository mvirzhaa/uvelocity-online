import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {DEFAULT_VEHICLE_STATS} from '../../shared/catalog.js';
import {DEFAULT_PHYSICS} from '../../shared/config.js';
import type {BeginRaceInput,RoomSnapshot} from '../../shared/types.js';
import {registerRaceRooms} from '../../server/realtime/RaceRoom.js';
import type {RealtimeServices} from '../../server/realtime/contracts.js';
import {allowedPrayerStatus} from './prayer-fixture.js';

const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string,timeout=5000){const deadline=Date.now()+timeout;while(!check()){if(Date.now()>deadline)throw new Error('Timeout: '+label);await delay(10);}}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve};}
const selected={carId:'brz' as const,color:'#2866b8',finish:'metallic' as const,rimId:'stock'};
interface Observed {room:Room;userId:string;snapshot:RoomSnapshot|null;errors:Array<{code:string;message:string}>;results:unknown[];countdowns:RoomSnapshot[]}

test('Authoritative arena barrier waits for every frozen participant and safely cancels failed attempts',{timeout:40000},async t=>{
 const tickets=new Map<string,string>(),revoked=new Set<string>(),begun=new Map<string,BeginRaceInput>(),beginCalls=new Map<string,number>(),aborts=new Map<string,number>(),settlements=new Set<string>();
 let beginGate:ReturnType<typeof deferred>|null=null;
 const services:RealtimeServices={
  async consumeRaceTicket({ticket,headers}){const id=tickets.get(ticket);if(!id||headers.cookie!=='sid='+id)return null;tickets.delete(ticket);return{id,displayName:id};},
  async authenticate(headers){const id=headers.cookie?.slice(4);return id&&!revoked.has(id)?{id,displayName:id}:null;},
  async gameplayAccess(){return allowedPrayerStatus();},
  async resolveLoadout(_id,selection,version='1'){return{...selection,rimId:selection.rimId??'stock',stats:DEFAULT_VEHICLE_STATS[selection.carId],tuningVersion:version};},
  async getActiveRuleset(){return{version:'1',cars:DEFAULT_VEHICLE_STATS,physics:{...DEFAULT_PHYSICS}};},
  async beginRace(input){beginCalls.set(input.raceId,(beginCalls.get(input.raceId)??0)+1);const gate=beginGate;if(gate)await gate.promise;begun.set(input.raceId,input);},
  async finalizeRace(result){assert(begun.has(result.raceId));settlements.add(result.raceId);return{raceId:result.raceId,rewards:[]};},
  async abortRace(id){aborts.set(id,(aborts.get(id)??0)+1);},
 };
 const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false}),opened:Room[]=[];
 const registry=registerRaceRooms(server,services,{countdownMs:180,loadingTimeoutMs:700,reconnectSeconds:.15,snapshotRateMs:20,finishRetentionMs:1500,sessionCheckMs:1000});
 await server.listen(0,'127.0.0.1');const address=http.address();assert(address&&typeof address==='object');const endpoint='http://127.0.0.1:'+address.port;
 function observer(room:Room,userId:string):Observed{
  opened.push(room);room.reconnection.enabled=false;const state:Observed={room,userId,snapshot:null,errors:[],results:[],countdowns:[]};
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{state.snapshot=snapshot;if(snapshot.phase==='countdown')state.countdowns.push(snapshot);});room.onMessage('room_error',error=>state.errors.push(error));room.onMessage('result',result=>state.results.push(result));room.onMessage('pong',()=>{});room.onError(()=>{});room.send('sync');return state;
 }
 async function createPair(){
  const id=randomUUID().slice(0,8),a=id+'-fast',b=id+'-slow',at=randomUUID(),bt=randomUUID();tickets.set(at,a);tickets.set(bt,b);
  const host=await new Client(endpoint,{headers:{cookie:'sid='+a}}).create('race',{ticket:at,maxHumans:3,bots:0,laps:1,loadout:selected}),first=observer(host,a);
  const peer=await new Client(endpoint,{headers:{cookie:'sid='+b}}).joinById(host.roomId,{ticket:bt,loadout:selected}),second=observer(peer,b);
  await waitFor(()=>first.snapshot?.members.length===2&&second.snapshot?.members.length===2,'pair joined');return[first,second] as const;
 }
 async function prepare(pair:readonly Observed[]){
  for(const state of pair)state.room.send('ready',{ready:true,assetsLoaded:true});
  await waitFor(()=>pair[0]!.snapshot?.members.every(member=>member.ready&&member.assetsLoaded)===true,'lobby readiness');
  pair[0]!.room.send('start');
  await waitFor(()=>pair.every(state=>state.snapshot?.phase==='loading'&&state.snapshot.racers.length===2&&!!state.snapshot.startToken),'frozen loading scene');
  return structuredClone(pair[0]!.snapshot!);
 }
 const ack=(state:Observed,scene=state.snapshot!)=>state.room.send('arena_ready',{raceId:scene.raceId,startToken:scene.startToken});
 async function close(pair:readonly Observed[]){for(const state of pair)if(state.room.connection.isOpen)await state.room.leave();}
 try{
  await t.test('Fast client waits for slow client; stale/duplicate acknowledgments and input cannot advance loading',async()=>{
   const pair=await createPair();try{
    const scene=await prepare(pair),raceId=scene.raceId!;assert.equal(scene.startAt,null);assert.equal(scene.elapsedMs,0);assert.equal(scene.tick,0);assert.equal(scene.members.every(member=>member.arenaReady===false),true);
    const lateUser='late-'+randomUUID(),lateTicket=randomUUID();tickets.set(lateTicket,lateUser);await assert.rejects(new Client(endpoint,{headers:{cookie:'sid='+lateUser}}).joinById(pair[0].room.roomId,{ticket:lateTicket,loadout:selected}),'Frozen loading roster rejects late entrants even with an unused seat');
    pair[0].room.send('arena_ready',{raceId,startToken:'stale-token'});await waitFor(()=>pair[0].errors.some(error=>error.code==='ARENA_ACK_REJECTED'),'stale ack rejected');assert(pair[0].snapshot!.members.every(member=>!member.arenaReady));
    ack(pair[0],scene);ack(pair[0],scene);pair[0].room.send('start');pair[0].room.send('start');
    pair[0].room.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:true});
    await waitFor(()=>pair[0].snapshot?.members.find(member=>member.id===pair[0].room.sessionId)?.arenaReady===true,'fast arena ready');await delay(180);
    assert.equal(pair[0].snapshot!.phase,'loading');assert.equal(pair[0].snapshot!.startAt,null);assert.equal(pair[0].snapshot!.tick,0);assert.equal(pair[0].snapshot!.elapsedMs,0);
    assert.deepEqual(pair[0].snapshot!.racers.map(r=>[r.x,r.z,r.lastProcessedSeq]),scene.racers.map(r=>[r.x,r.z,0]));assert.equal(beginCalls.get(raceId)??0,0);assert.equal(begun.has(raceId),false);assert.equal(settlements.has(raceId),false);assert.equal(pair[0].results.length,0);
    const lastReady=Date.now();ack(pair[1],scene);await waitFor(()=>pair.every(state=>state.countdowns.length>0),'shared countdown');
    const starts=pair.map(state=>state.countdowns[0]!.startAt);assert.equal(new Set(starts).size,1);assert(starts[0]!>=lastReady+150);assert.equal(beginCalls.get(raceId),1);assert(pair.every(state=>state.countdowns[0]!.members.every(member=>member.arenaReady)));
    await waitFor(()=>pair.every(state=>state.snapshot?.phase==='racing'),'both race together');assert.equal(new Set(pair.map(state=>state.snapshot!.startAt)).size,1);
   }finally{await close(pair);}
  });
  await t.test('Missing arena times out to an unlocked lobby with fresh readiness and a nonreusable token',async()=>{
   const pair=await createPair();try{
    const scene=await prepare(pair);ack(pair[0],scene);await waitFor(()=>pair.every(state=>state.snapshot?.phase==='lobby'),'loading timeout');
    assert(pair.every(state=>state.errors.some(error=>error.code==='ARENA_LOAD_TIMEOUT')));assert(pair[0].snapshot!.members.every(member=>!member.ready&&!member.assetsLoaded&&!member.arenaReady));assert.equal(pair[0].snapshot!.raceId,null);assert.equal(pair[0].snapshot!.startToken,null);assert.equal(registry.findByCode(scene.inviteCode)?.joinable,true);assert.equal(beginCalls.has(scene.raceId!),false);assert.equal(settlements.has(scene.raceId!),false);
    const retry=await prepare(pair);assert.notEqual(retry.startToken,scene.startToken);assert.notEqual(retry.raceId,scene.raceId);ack(pair[1],scene);await waitFor(()=>pair[1].errors.some(error=>error.code==='ARENA_ACK_REJECTED'),'old attempt rejected');assert.equal(pair[1].snapshot!.phase,'loading');assert(pair[1].snapshot!.members.every(member=>!member.arenaReady));
    pair[0].room.send('ready',{ready:false,assetsLoaded:false});await waitFor(()=>pair[0].snapshot?.phase==='lobby','retry withdrawn');
   }finally{await close(pair);}
  });
  await t.test('Explicit renderer failure and withdrawn readiness cancel everyone without a race row or reward',async()=>{
   for(const kind of ['failure','unready'] as const){const pair=await createPair();try{
    const scene=await prepare(pair);ack(pair[0],scene);
    if(kind==='failure')pair[1].room.send('arena_failed',{raceId:scene.raceId,startToken:scene.startToken,reason:'Missing model'});else pair[1].room.send('ready',{ready:false,assetsLoaded:false});
    await waitFor(()=>pair.every(state=>state.snapshot?.phase==='lobby'),kind+' cancelled');assert(pair[0].errors.some(error=>error.code===(kind==='failure'?'ARENA_LOAD_FAILED':'START_CANCELLED')));assert.equal(beginCalls.has(scene.raceId!),false);assert.equal(settlements.has(scene.raceId!),false);
   }finally{await close(pair);}}
  });
  await t.test('Disconnect or revoked login during loading cannot leave a participant counted ready',async()=>{
   for(const kind of ['disconnect','revoke'] as const){const pair=await createPair();try{
    const scene=await prepare(pair);ack(pair[0],scene);
    if(kind==='disconnect')pair[1].room.connection.close(1000);else{revoked.add(pair[1].userId);ack(pair[1],scene);}
    await waitFor(()=>pair[0].snapshot?.phase==='lobby',kind+' cancelled loading');assert(pair[0].errors.some(error=>error.code==='START_DISCONNECTED'));assert.equal(beginCalls.has(scene.raceId!),false);assert.equal(settlements.has(scene.raceId!),false);assert(pair[0].snapshot!.members.every(member=>!member.arenaReady&&!member.ready));
   }finally{await close(pair);}}
  });
  await t.test('Late beginRace completion cannot resurrect a cancelled, timed-out or disconnected attempt',async()=>{
   for(const kind of ['unready','timeout','disconnect'] as const){const pair=await createPair(),gate=deferred();beginGate=gate;try{
    const scene=await prepare(pair),raceId=scene.raceId!;ack(pair[0],scene);ack(pair[1],scene);await waitFor(()=>beginCalls.has(raceId),'beginRace pending');assert.equal(pair[0].snapshot!.phase,'loading');assert.equal(pair[0].snapshot!.startAt,null);assert.equal(begun.has(raceId),false);
    if(kind==='unready')pair[1].room.send('ready',{ready:false,assetsLoaded:false});if(kind==='disconnect')pair[1].room.connection.close(1000);
    await waitFor(()=>pair[0].snapshot?.phase==='lobby',kind+' while database pending');gate.resolve();await waitFor(()=>aborts.get(raceId)===1,'late persisted row aborted');await delay(30);
    assert.equal(beginCalls.get(raceId),1);assert.equal(pair[0].snapshot!.phase,'lobby');assert.equal(pair[0].snapshot!.startAt,null);assert.equal(pair[0].snapshot!.raceId,null);assert.equal(pair[0].countdowns.length,0);assert.equal(settlements.has(raceId),false);
   }finally{gate.resolve();beginGate=null;await close(pair);}}
  });
  await t.test('A disconnect during countdown cancels its persisted race before green',async()=>{
   const pair=await createPair();try{
    const scene=await prepare(pair),raceId=scene.raceId!;ack(pair[0],scene);ack(pair[1],scene);await waitFor(()=>pair[0].snapshot?.phase==='countdown','countdown before drop');pair[1].room.connection.close(1000);
    await waitFor(()=>pair[0].snapshot?.phase==='lobby'&&aborts.get(raceId)===1,'countdown cancellation');await delay(220);assert.equal(pair[0].snapshot!.phase,'lobby');assert.equal(settlements.has(raceId),false);assert.equal(beginCalls.get(raceId),1);
   }finally{await close(pair);}
  });
 }finally{(beginGate as ReturnType<typeof deferred>|null)?.resolve();for(const room of opened)if(room.connection.isOpen)await room.leave().catch(()=>{});await server.gracefullyShutdown(false);}
});
