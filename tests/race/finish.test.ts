import {CAR_IDS} from '../../shared/types.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Server,matchMaker} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {DEFAULT_VEHICLE_STATS} from '../../shared/catalog.js';
import {DEFAULT_PHYSICS,freezeLoadout,validateRoomConfig} from '../../shared/config.js';
import {advanceLapProgress,advanceVehicle,createRacer,sortRacers} from '../../shared/simulation.js';
import {pointAt} from '../../shared/track.js';
import type {RacerState,RaceResult,RaceSettlement,RoomSnapshot} from '../../shared/types.js';
import {RaceRuntime} from '../../server/realtime/RaceRuntime.js';
import {registerRaceRooms} from '../../server/realtime/RaceRoom.js';
import type {RealtimeServices} from '../../server/realtime/contracts.js';
import {allowedPrayerStatus} from './prayer-fixture.js';

const selected={carId:'brz' as const,color:'#2866b8',finish:'metallic' as const,rimId:'stock'};
const loadout=()=>freezeLoadout({...selected,stats:DEFAULT_VEHICLE_STATS.brz,tuningVersion:'v1'});
function runtime(humans=2,bots=2,maximumDurationMs?:number):RaceRuntime {
  return new RaceRuntime(validateRoomConfig({maxHumans:Math.max(1,humans),bots,laps:1,collisionMode:'ghost'}),
    [...Array.from({length:humans},(_,i)=>createRacer('human-'+i,'Human '+i,loadout(),'user-'+i)),...Array.from({length:bots},(_,i)=>createRacer('bot-'+i,'Bot '+i,loadout(),null,true))],{},400,maximumDurationMs);
}
/** Server-only fixture: the last ordered gate is still crossed by real physics. */
function stage(sim:RaceRuntime,racer:RacerState,t:number,speed=0):void {
  const point=pointAt(sim.track,t);
  Object.assign(racer,{x:point.x,z:point.z,heading:Math.atan2(point.tx,point.tz),trackT:t,lastTrackT:t,trackIdx:Math.floor(t*sim.track.samples.length),progress:t,
    nextGate:Math.floor(t*4)+1,lap:1,completedLaps:0,lapStartedMs:0,speed,distanceMeters:t*sim.track.length});
}
const score=(r:RacerState)=>({progress:r.progress,nextGate:r.nextGate,completedLaps:r.completedLaps,lap:r.lap,lapStartedMs:r.lapStartedMs,lastLapMs:r.lastLapMs,bestLapMs:r.bestLapMs,finishTimeMs:r.finishTimeMs,distanceMeters:r.distanceMeters,lastTrackT:r.lastTrackT,lastResetMs:r.lastResetMs});

test('crossing retains speed and finishers coast monotonically with every control locked',()=>{
  const sim=runtime(),winner=sim.racers[0]!;stage(sim,winner,.9999,60);
  sim.acceptInput(winner.id,{seq:1,throttle:1,brake:0,steer:0,nitro:true});
  const events=sim.step();assert(winner.finished);assert(events.some(event=>event.type==='finish'&&event.racerId===winner.id));assert(winner.speed>59);assert(!winner.nitroActive);assert.equal(sim.ended,false);
  const recorded=score(winner),fuel=winner.nitro,start={x:winner.x,z:winner.z},crossingSpeed=winner.speed;
  assert(recorded.finishTimeMs!>=0&&recorded.finishTimeMs!<=sim.elapsedMs);
  assert.equal(sim.acceptInput(winner.id,{seq:2,throttle:1,brake:1,steer:1,nitro:true,reset:true}),false);
  for(let tick=0;tick<1500;tick++) {
    const before=winner.speed;
    // Even a direct prediction call must ignore forged/held controls after finish.
    assert.deepEqual(advanceVehicle(winner,{seq:999,throttle:1,brake:1,steer:1,nitro:true,reset:true},sim.track,winner.loadout.stats,1/90,999999,{...DEFAULT_PHYSICS,coastDrag:0}),[]);
    assert(winner.speed<=before&&winner.speed>=0);assert(before-winner.speed<=5.5/90+1e-9);assert(!winner.nitroActive);assert.equal(winner.nitro,fuel);
    assert.deepEqual(advanceLapProgress(winner,winner.trackT,1,999999,1000/90),[]);assert.deepEqual(score(winner),recorded);
  }
  assert.equal(winner.speed,0);assert(crossingSpeed>0);assert(Math.hypot(winner.x-start.x,winner.z-start.z)>20);
  const stopped={x:winner.x,z:winner.z};advanceVehicle(winner,{seq:1000,throttle:1,brake:0,steer:1,nitro:true},sim.track,winner.loadout.stats,1/90);assert.deepEqual({x:winner.x,z:winner.z},stopped);
});

test('runtime moves an early finisher without changing score while the other human races',()=>{
  const sim=runtime(),winner=sim.racers[0]!;stage(sim,winner,.9999,40);sim.step();assert(winner.finished);
  const recorded=score(winner),beforeSpeed=winner.speed,start={x:winner.x,z:winner.z};
  for(let tick=0;tick<90;tick++)sim.step();
  assert(!sim.ended);assert(winner.speed>0&&winner.speed<beforeSpeed);assert(Math.hypot(winner.x-start.x,winner.z-start.z)>10);assert.deepEqual(score(winner),recorded);
  const finalHuman=sim.racers[1]!;stage(sim,finalHuman,.9999,50);sim.step();assert(finalHuman.finished);assert(sim.ended);assert(finalHuman.speed>0);
  const finalState=sim.snapshots(),finalElapsed=sim.elapsedMs;assert.deepEqual(sim.step(),[]);assert.deepEqual(sim.snapshots(),finalState);assert.equal(sim.elapsedMs,finalElapsed);
});

test('last human finish ends immediately, keeps finished bots ranked, and classifies unfinished bots by progress',()=>{
  const sim=runtime(1,3),[human,finishedBot,farBot,nearBot]=sim.racers;
  sim.tick=1800;sim.elapsedMs=20000;
  Object.assign(finishedBot!,{finished:true,ghost:true,completedLaps:1,progress:1,finishTimeMs:19000,lastLapMs:19000,bestLapMs:19000});
  stage(sim,farBot!,.3);stage(sim,nearBot!,.8);stage(sim,human!,.9999,50);
  const events=sim.step();assert(events.some(event=>event.type==='finish'&&event.racerId===human!.id));assert(sim.ended);assert.equal(sim.tick,1801);
  assert(human!.finished);assert.equal(finishedBot!.finishTimeMs,19000);assert(!finishedBot!.dnf);
  assert(farBot!.dnf&&nearBot!.dnf);assert.equal(farBot!.finishTimeMs,null);assert.equal(nearBot!.finishTimeMs,null);assert.equal(nearBot!.completedLaps,0);
  assert.deepEqual(sortRacers(sim.racers).map(r=>r.id),[finishedBot!.id,human!.id,nearBot!.id,farBot!.id]);
});

test('temporary disconnected humans remain pending until reconnect or an explicit DNF',()=>{
  const sim=runtime(),[winner,peer]=sim.racers;stage(sim,winner!,.9999,45);sim.step();sim.setConnected(peer!.id,false);
  for(let i=0;i<40;i++)sim.step();assert(!sim.ended);assert(!peer!.dnf);
  sim.setConnected(peer!.id,true);assert(sim.acceptInput(peer!.id,{seq:1,throttle:1,brake:0,steer:0,nitro:false}));sim.step();assert(!sim.ended);
  sim.setConnected(peer!.id,false);sim.markDnf(peer!.id);sim.step();assert(sim.ended);assert(winner!.finished);assert(peer!.dnf);assert(sim.racers.filter(r=>r.isBot).every(r=>r.dnf));
});

test('all departures, empty human rosters, and deadline expiry cannot leave a bot-only race running',()=>{
  const departed=runtime();for(const racer of departed.racers.filter(r=>!r.isBot))departed.markDnf(racer.id);departed.step();assert(departed.ended);assert(departed.racers.every(r=>r.dnf));
  const noHumans=runtime(0,2);noHumans.step();assert(noHumans.ended);assert(noHumans.racers.every(r=>r.dnf));
  const empty=runtime(0,0);empty.step();assert(empty.ended);
  const expired=runtime(2,2,40);while(!expired.ended)expired.step();assert(expired.racers.every(r=>r.dnf));assert(expired.elapsedMs<60);
});

const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string,timeout=6000){const limit=Date.now()+timeout;while(!check()){if(Date.now()>limit)throw new Error('Timeout: '+label);await delay(10);}}
interface Observation {room:Room;userId:string;snapshot:RoomSnapshot|null;results:Array<{result:RaceResult;reward:unknown}>}
interface LocalRoom {runtime:RaceRuntime;clients:Array<{sessionId:string}>;simulate():void;checkGameplay(client:unknown,force:boolean):Promise<boolean>}

test('real rooms settle without waiting for bots, preserve disconnect grace and freeze coasting during prayer',{timeout:30000},async t=>{
  const tickets=new Map<string,string>(),records=new Map<string,RaceResult>(),receipts=new Map<string,RaceSettlement>(),calls=new Map<string,number>(),credits=new Map<string,number>(),failOnce=new Set<string>();
  let blockedUser:string|null=null;const prayerStart=Date.now();
  const services:RealtimeServices={
    async consumeRaceTicket({ticket,headers}){const id=tickets.get(ticket);if(!id||headers.cookie!=='sid='+id)return null;tickets.delete(ticket);return{id,displayName:id};},
    async authenticate(headers){const id=headers.cookie?.slice(4);return id?{id,displayName:id}:null;},
    async gameplayAccess(id){const status=allowedPrayerStatus();if(id!==blockedUser)return status;const event={eventId:'finish-pause',prayer:'dhuhr' as const,name:'Zuhur',startedAt:new Date(prayerStart).toISOString(),resumesAt:new Date(prayerStart+900000).toISOString()};return{...status,allowed:false,paused:true,pauseEndsAt:event.resumesAt,currentPrayer:event,dailyTimes:[event]};},
    async resolveLoadout(_id,selection,version='v1'){return{...selection,rimId:selection.rimId??'stock',stats:DEFAULT_VEHICLE_STATS[selection.carId],tuningVersion:version};},
    async resolveVehicleRestriction(categoryId){if(categoryId)throw new Error('Fixture category unavailable');return{categoryId:null,categoryName:null,allowedCarIds:[...CAR_IDS]};},
    async getActiveRuleset(){return{version:'v1',cars:DEFAULT_VEHICLE_STATS,physics:{...DEFAULT_PHYSICS}};},
    async beginRace(){},
    async finalizeRace(result){
      calls.set(result.raceId,(calls.get(result.raceId)??0)+1);
      if(!receipts.has(result.raceId)){
        records.set(result.raceId,structuredClone(result));credits.set(result.raceId,1);
        receipts.set(result.raceId,{raceId:result.raceId,rewards:result.participants.filter(person=>person.userId).map(person=>({userId:person.userId!,amount:person.status==='finished'?'100':'0',balance:person.status==='finished'?'1100':'1000'}))});
      }else assert.deepEqual(result,records.get(result.raceId),'Retry uses one frozen final result');
      if(failOnce.delete(result.raceId))throw new Error('Fixture: committed result acknowledgement lost');
      return receipts.get(result.raceId)!;
    },
    async abortRace(){},log(){},
  };
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false}),opened:Room[]=[];
  registerRaceRooms(server,services,{countdownMs:50,reconnectSeconds:.35,snapshotRateMs:20,finishRetentionMs:10000,sessionCheckMs:2000});
  await server.listen(0,'127.0.0.1');const address=http.address();assert(address&&typeof address==='object');const endpoint='http://127.0.0.1:'+address.port;
  function observe(room:Room,userId:string):Observation {
    opened.push(room);room.reconnection.enabled=false;const state:Observation={room,userId,snapshot:null,results:[]},acked=new Set<string>();
    room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{state.snapshot=snapshot;if(snapshot.phase==='loading'&&snapshot.startToken&&snapshot.racers.length&&!acked.has(snapshot.startToken)){acked.add(snapshot.startToken);room.send('arena_ready',{raceId:snapshot.raceId,startToken:snapshot.startToken});}});
    room.onMessage('result',value=>state.results.push(value));room.onMessage('room_error',()=>{});room.onMessage('pong',()=>{});room.onError(()=>{});room.send('sync');return state;
  }
  async function pair():Promise<[Observation,Observation,LocalRoom]> {
    const prefix=randomUUID(),a=prefix+'-a',b=prefix+'-b',at=randomUUID(),bt=randomUUID();tickets.set(at,a);tickets.set(bt,b);
    const host=observe(await new Client(endpoint,{headers:{cookie:'sid='+a}}).create('race',{ticket:at,maxHumans:2,bots:3,laps:1,collisionMode:'ghost',loadout:selected}),a);
    const peer=observe(await new Client(endpoint,{headers:{cookie:'sid='+b}}).joinById(host.room.roomId,{ticket:bt,loadout:selected}),b);
    host.room.send('ready',{ready:true,assetsLoaded:true});peer.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>host.snapshot?.members.every(member=>member.ready)===true,'finish readiness');host.room.send('start');await waitFor(()=>host.snapshot?.phase==='racing'&&peer.snapshot?.phase==='racing','finish race start');
    return[host,peer,matchMaker.getLocalRoomById(host.room.roomId) as unknown as LocalRoom];
  }
  try {
    await t.test('final human produces a frozen result immediately and settlement retries credit once',async()=>{
      const [host,peer,local]=await pair(),a=local.runtime.racers.find(r=>r.id===host.room.sessionId)!,b=local.runtime.racers.find(r=>r.id===peer.room.sessionId)!,bots=local.runtime.racers.filter(r=>r.isBot),lateBot=bots[2]!;
      stage(local.runtime,a!,.9999,55);local.simulate();assert(a!.finished);assert(!local.runtime.ended);
      const saved=score(a!),before=a!.speed;await delay(80);assert(a!.speed<before&&a!.speed>0);assert.deepEqual(score(a!),saved);
      Object.assign(bots[0]!,{finished:true,ghost:true,completedLaps:1,progress:1,finishTimeMs:0,lastLapMs:0,bestLapMs:0});stage(local.runtime,bots[1]!,.8);stage(local.runtime,lateBot,.3);
      failOnce.add(host.snapshot!.raceId!);stage(local.runtime,b!,.9999,45);local.simulate();assert(local.runtime.ended);assert(lateBot.dnf);const cutoff=local.runtime.elapsedMs;
      await waitFor(()=>records.has(host.snapshot!.raceId!),'immediate result with unfinished bots');assert.equal(records.get(host.snapshot!.raceId!)!.durationMs,cutoff);
      await waitFor(()=>host.results.length===1&&peer.results.length===1,'settlement retry delivery');
      const result=host.results[0]!.result;assert.equal(calls.get(result.raceId),2);assert.equal(credits.get(result.raceId),1);assert.equal(result.participants.filter(person=>person.isBot&&person.status==='dnf').length,2);assert.equal(result.participants[0]!.id,bots[0]!.id);assert.equal(result.participants.find(person=>person.id===a!.id)!.totalTimeMs,saved.finishTimeMs);
      assert(a!.speed>0&&b!.speed>0,'Final snapshot retains rollout velocity');const after=local.runtime.snapshots();for(let i=0;i<5;i++)local.simulate();assert.deepEqual(local.runtime.snapshots(),after);await delay(60);assert.equal(host.results.length,1);assert.equal(peer.results.length,1);
      await host.room.leave();await peer.room.leave();
    });
    await t.test('temporary disconnect is given existing grace; expiry ends without waiting bots',async()=>{
      const [host,peer,local]=await pair(),a=local.runtime.racers.find(r=>r.id===host.room.sessionId)!,b=local.runtime.racers.find(r=>r.id===peer.room.sessionId)!;
      stage(local.runtime,a,.9999,40);local.simulate();peer.room.connection.close(1000);
      await waitFor(()=>!b.connected,'dropped human');assert(!b.dnf);assert(!local.runtime.ended);await delay(90);assert(!local.runtime.ended);
      await waitFor(()=>b.dnf&&local.runtime.ended,'disconnect grace completion');await waitFor(()=>host.results.length===1,'winner result after grace');assert.equal(host.results[0]!.result.participants.find(person=>person.id===b.id)!.status,'dnf');assert(local.runtime.racers.filter(r=>r.isBot).every(r=>r.dnf));await host.room.leave();
    });
    await t.test('prayer freezes a finished coasting car and all remaining participants',async()=>{
      const [host,peer,local]=await pair(),a=local.runtime.racers.find(r=>r.id===host.room.sessionId)!;stage(local.runtime,a,.9999,45);local.simulate();await delay(40);assert(a.finished&&a.speed>0);
      blockedUser=peer.userId;await local.checkGameplay(local.clients.find(client=>client.sessionId===peer.room.sessionId),true);await waitFor(()=>host.snapshot?.phase==='prayer_pause','coasting prayer pause');
      const frozen=structuredClone(local.runtime.snapshots()),elapsed=local.runtime.elapsedMs;await delay(100);assert.deepEqual(local.runtime.snapshots(),frozen);assert.equal(local.runtime.elapsedMs,elapsed);assert.equal(host.results.length,0);assert(!local.runtime.ended);
      blockedUser=null;await peer.room.leave();await host.room.leave();
    });
  } finally {blockedUser=null;for(const room of opened)if(room.connection.isOpen)await room.leave().catch(()=>{});await server.gracefullyShutdown(false);}
});
