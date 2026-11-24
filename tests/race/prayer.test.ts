import {CAR_IDS} from '../../shared/types.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {DEFAULT_VEHICLE_STATS} from '../../shared/catalog.js';
import {DEFAULT_PHYSICS} from '../../shared/config.js';
import type {PrayerName,PrayerStatus,PrayerWindow} from '../../shared/prayer.js';
import type {BeginRaceInput,RaceResult,RoomSnapshot} from '../../shared/types.js';
import {registerRaceRooms} from '../../server/realtime/RaceRoom.js';
import type {RealtimeServices} from '../../server/realtime/contracts.js';
import {allowedPrayerStatus} from './prayer-fixture.js';

const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean,label:string,timeout=6000){const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error('Timeout: '+label);await delay(10);}}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve};}
interface Observed {room:Room;userId:string;snapshot:RoomSnapshot|null;errors:Array<{code:string;message:string}>;results:unknown[]}
interface Pair {host:Observed;peer:Observed;autoArena:boolean;event?:PrayerWindow}
const selection={carId:'brz' as const,color:'#2866b8',finish:'metallic' as const,rimId:'stock'};
const positions=(snapshot:RoomSnapshot)=>snapshot.racers.map(r=>[r.id,r.x,r.z,r.heading,r.speed,r.lap,r.completedLaps,r.progress,r.nitro]);

test('Room prayer pause freezes all racers and requires fresh unanimous consent after the full hold',{timeout:45000},async t=>{
 let offset=Date.parse('2026-11-20T03:00:00Z')-Date.now(),advancePerReadMs=0,beginGate:ReturnType<typeof deferred>|null=null;
 const now=()=>{offset+=advancePerReadMs;return Date.now()+offset;},moveTo=(time:number)=>{offset+=Math.max(0,time-now());};
 const tickets=new Map<string,string>(),windows=new Map<string,PrayerWindow[]>(),opened:Room[]=[],begun=new Map<string,BeginRaceInput>(),beginCalls=new Map<string,number>(),aborted=new Set<string>(),results=new Map<string,RaceResult>();
 const lookupHolds=new Map<string,{entered:ReturnType<typeof deferred>;gate:ReturnType<typeof deferred>;skip?:number}>();
 function addPrayer(userId:string,start:number,prayer:PrayerName='dhuhr'){
  const event:PrayerWindow={eventId:prayer+':'+new Date(start).toISOString(),prayer,name:prayer==='asr'?'Asar':'Zuhur',startedAt:new Date(start).toISOString(),resumesAt:new Date(start+900000).toISOString()};windows.set(userId,[...(windows.get(userId)??[]),event]);return event;
 }
 function statusFor(userId:string):PrayerStatus{
  const clock=now(),status=allowedPrayerStatus(clock),events=windows.get(userId)??[],active=events.find(event=>Date.parse(event.startedAt)<=clock&&Date.parse(event.resumesAt)>clock)??null;
  const next=events.filter(event=>Date.parse(event.startedAt)>clock).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt))[0];
  if(next)status.nextPrayer=next;
  status.currentPrayer=active;status.allowed=!active;status.paused=!!active;status.pauseEndsAt=active?.resumesAt??null;status.dailyTimes=events;
  if(userId.endsWith('-peer'))status.location={...status.location,label:'Jayapura',cityId:'jayapura',longitude:140.7,latitude:-2.5,timezone:'Asia/Jayapura'};
  return status;
 }
 const services:RealtimeServices={
  async consumeRaceTicket({ticket,headers}){const id=tickets.get(ticket);if(!id||headers.cookie!=='sid='+id)return null;tickets.delete(ticket);return{id,displayName:id};},
  async authenticate(headers){const id=headers.cookie?.slice(4);return id?{id,displayName:id}:null;},
  async gameplayAccess(id){const captured=statusFor(id),hold=lookupHolds.get(id);if(hold){if((hold.skip??0)>0)hold.skip=(hold.skip??0)-1;else{lookupHolds.delete(id);hold.entered.resolve();await hold.gate.promise;}}return captured;},
  async resolveLoadout(_id,loadout,version='1'){return{...loadout,rimId:loadout.rimId??'stock',stats:DEFAULT_VEHICLE_STATS[loadout.carId],tuningVersion:version};},
  async resolveVehicleRestriction(categoryId){if(categoryId)throw new Error('Fixture category unavailable');return{categoryId:null,categoryName:null,allowedCarIds:[...CAR_IDS]};},
    async getActiveRuleset(){return{version:'1',cars:DEFAULT_VEHICLE_STATS,physics:{...DEFAULT_PHYSICS}};},
  async beginRace(input){beginCalls.set(input.raceId,(beginCalls.get(input.raceId)??0)+1);const gate=beginGate;if(gate)await gate.promise;begun.set(input.raceId,input);},
  async finalizeRace(result){results.set(result.raceId,result);return{raceId:result.raceId,rewards:[]};},
  async abortRace(id){aborted.add(id);},
 };
 const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
 registerRaceRooms(server,services,{now,countdownMs:90,loadingTimeoutMs:45000,reconnectSeconds:.3,snapshotRateMs:20,finishRetentionMs:1500,maxRaceDurationMs:600000,sessionCheckMs:1000});
 await server.listen(0,'127.0.0.1');const address=http.address();assert(address&&typeof address==='object');const endpoint='http://127.0.0.1:'+address.port;
 const client=(userId:string)=>new Client(endpoint,{headers:{cookie:'sid='+userId}});
 const ticket=(userId:string)=>{const value=randomUUID();tickets.set(value,userId);return value;};
 function observe(room:Room,userId:string,autoArena=true):Observed{
  room.reconnection.enabled=false;opened.push(room);const state:Observed={room,userId,snapshot:null,errors:[],results:[]},acknowledged=new Set<string>();
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{state.snapshot=snapshot;if(autoArena&&snapshot.phase==='loading'&&snapshot.startToken&&snapshot.racers.length&&!acknowledged.has(snapshot.startToken)){acknowledged.add(snapshot.startToken);room.send('arena_ready',{raceId:snapshot.raceId,startToken:snapshot.startToken});}});
  room.onMessage('room_error',error=>state.errors.push(error));room.onMessage('result',result=>state.results.push(result));room.onMessage('pong',()=>{});room.onError(()=>{});room.send('sync');return state;
 }
 async function pair(options:{bots?:number;leadMs?:number;autoArena?:boolean}={}):Promise<Pair>{
  const prefix=randomUUID().slice(0,8),hostId=prefix+'-host',peerId=prefix+'-peer',event=options.leadMs===undefined?undefined:addPrayer(hostId,now()+options.leadMs);
  const host=observe(await client(hostId).create('race',{ticket:ticket(hostId),maxHumans:3,bots:options.bots??2,laps:1,loadout:selection}),hostId,options.autoArena??true);
  const peer=observe(await client(peerId).joinById(host.room.roomId,{ticket:ticket(peerId),loadout:selection}),peerId,options.autoArena??true);
  await waitFor(()=>host.snapshot?.members.length===2&&peer.snapshot?.members.length===2,'room participants');return{host,peer,event,autoArena:options.autoArena??true};
 }
 async function start(p:Pair,phase:RoomSnapshot['phase']='racing'){
  p.host.room.send('ready',{ready:true,assetsLoaded:true});p.peer.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>p.host.snapshot?.members.every(member=>member.ready)===true,'lobby ready');p.host.room.send('start');await waitFor(()=>p.host.snapshot?.phase===phase&&!!p.host.snapshot.raceId,'start '+phase);
 }
 const consent=(state:Observed,token=state.snapshot!.prayerPause!.pauseToken)=>state.room.send('resume_ready',{pauseToken:token});
 async function close(p:Pair){for(const state of[p.host,p.peer])if(state.room.connection.isOpen)await state.room.leave();}
 try{
  await t.test('One local event freezes humans, bots and all race clocks; another room continues; expiry alone never resumes',async()=>{
   const p=await pair({leadMs:5000}),other=await pair({bots:1});try{
    await start(p);await start(other);p.host.room.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:true});await delay(60);
    moveTo(Date.parse(p.event!.startedAt)+1);
    // Force distinct clock readings so a separately sampled start/deadline
    // cannot accidentally shorten the promised full fifteen-minute hold.
    advancePerReadMs=2;
    try{await waitFor(()=>p.host.snapshot?.phase==='prayer_pause'&&p.peer.snapshot?.phase==='prayer_pause','room prayer pause');}finally{advancePerReadMs=0;}
    const paused=structuredClone(p.host.snapshot!),pause=paused.prayerPause!,otherTick=other.host.snapshot!.tick;
    assert(pause.resumeEligibleAt>=pause.startedAt+900000);assert.equal(pause.requiredIds.length,2);assert.equal(paused.racers.filter(r=>r.isBot).length,2);assert(!JSON.stringify(paused).includes('latitude'));assert(!JSON.stringify(paused).includes('longitude'));assert(!JSON.stringify(paused).includes('Asia/Jayapura'));
    for(let seq=2;seq<20;seq++)p.host.room.send('input',{seq,throttle:1,brake:0,steer:1,nitro:true});await delay(1100);
    assert.deepEqual(positions(p.host.snapshot!),positions(paused));assert.equal(p.host.snapshot!.tick,paused.tick);assert.equal(p.host.snapshot!.elapsedMs,paused.elapsedMs);assert.equal(p.host.snapshot!.prayerPause!.pauseToken,pause.pauseToken);assert.equal(p.host.snapshot!.prayerPause!.resumeEligibleAt,pause.resumeEligibleAt);assert(other.host.snapshot!.tick>otherTick);assert.equal(results.has(paused.raceId!),false);assert(p.host.room.connection.isOpen&&p.peer.room.connection.isOpen);
    consent(p.host);await waitFor(()=>p.host.errors.some(error=>error.code==='RESUME_TOO_EARLY'),'early consent rejected');consent(p.host,'old-token');await waitFor(()=>p.host.errors.some(error=>error.code==='RESUME_REJECTED'),'stale consent rejected');
    moveTo(pause.resumeEligibleAt+1);consent(p.host);await waitFor(()=>p.host.snapshot?.prayerPause?.readyIds.includes(p.host.room.sessionId)===true,'one explicit consent');const oldErrors=p.host.errors.length;consent(p.host);await waitFor(()=>p.host.errors.length>oldErrors,'duplicate consent rejected');assert.equal(p.host.errors.at(-1)!.code,'RESUME_REJECTED');await delay(70);assert.equal(p.host.snapshot!.phase,'prayer_pause');assert.equal(p.host.snapshot!.tick,paused.tick);
    const later=addPrayer(p.peer.userId,now(),'asr');consent(p.peer,pause.pauseToken);await waitFor(()=>p.host.snapshot?.prayerPause?.pauseToken!==pause.pauseToken,'new city event extends pause');const extended=structuredClone(p.host.snapshot!.prayerPause!);
    assert(extended.resumeEligibleAt>=Date.parse(later.startedAt)+900000);assert(extended.resumeEligibleAt>pause.resumeEligibleAt);assert.deepEqual(extended.readyIds,[]);assert.equal(extended.triggers.length,2);consent(p.host,pause.pauseToken);await delay(30);assert.deepEqual(p.host.snapshot!.prayerPause!.readyIds,[]);
    moveTo(extended.resumeEligibleAt+1);consent(p.host,extended.pauseToken);consent(p.peer,extended.pauseToken);await waitFor(()=>p.host.snapshot?.phase==='resume_countdown'&&p.peer.snapshot?.phase==='resume_countdown','shared resume countdown');
    const resumeAt=p.host.snapshot!.prayerPause!.resumeAt!;assert.equal(resumeAt,p.peer.snapshot!.prayerPause!.resumeAt);assert(resumeAt>=now()+2800);assert.equal(p.host.snapshot!.tick,paused.tick);
    moveTo(resumeAt+1);await waitFor(()=>p.host.snapshot?.phase==='racing'&&p.peer.snapshot?.phase==='racing','room resumes together');assert.equal(p.host.snapshot!.prayerPause,null);assert(p.host.snapshot!.elapsedMs-paused.elapsedMs<500);assert(p.host.snapshot!.racers.every(r=>!r.dnf&&!r.nitroActive));assert.equal(p.host.snapshot!.racers.find(r=>r.id===p.host.room.sessionId)!.lastProcessedSeq,1,'No paused throttle/nitro queue is replayed');
   }finally{await close(p);await close(other);}
  });
  await t.test('Countdown is frozen before green; a leaving participant becomes DNF without deadlocking remaining consent',async()=>{
   const p=await pair({leadMs:5000,bots:1});try{
    await start(p,'countdown');moveTo(Date.parse(p.event!.startedAt)+1);await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','countdown pause');assert.equal(p.host.snapshot!.prayerPause!.previousPhase,'countdown');assert.equal(p.host.snapshot!.tick,0);
    const pause=p.host.snapshot!.prayerPause!;await p.peer.room.leave();await waitFor(()=>p.host.snapshot?.prayerPause?.requiredIds.length===1,'left slot removed');assert(p.host.snapshot!.racers.find(r=>r.id===p.peer.room.sessionId)!.dnf);
    moveTo(pause.resumeEligibleAt+1);consent(p.host);await waitFor(()=>p.host.snapshot?.phase==='resume_countdown','remaining participant consents');moveTo(p.host.snapshot!.prayerPause!.resumeAt!+1);await waitFor(()=>p.host.snapshot?.phase==='racing','paused countdown goes green');assert(!p.host.snapshot!.racers.find(r=>r.id===p.host.room.sessionId)!.dnf);assert(p.host.snapshot!.elapsedMs<500);
   }finally{await close(p);}
  });
  await t.test('Loading prayer cancels the scene token and late beginRace row; resume returns to a fresh lobby barrier',async()=>{
   const p=await pair(),gate=deferred();beginGate=gate;try{
    await start(p,'loading');await waitFor(()=>!!p.host.snapshot?.raceId&&beginCalls.has(p.host.snapshot.raceId),'database start pending');const raceId=p.host.snapshot!.raceId!,token=p.host.snapshot!.startToken!;addPrayer(p.host.userId,now());
    await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','idle loading prayer poll');const pause=p.host.snapshot!.prayerPause!;assert.equal(pause.previousPhase,'loading');assert.equal(p.host.snapshot!.raceId,null);assert.equal(p.host.snapshot!.racers.length,0);gate.resolve();await waitFor(()=>aborted.has(raceId),'late row aborted');assert.equal(beginCalls.get(raceId),1);assert.equal(results.has(raceId),false);
    moveTo(pause.resumeEligibleAt+1);consent(p.host);consent(p.peer);await waitFor(()=>p.host.snapshot?.phase==='resume_countdown','lobby consent');moveTo(p.host.snapshot!.prayerPause!.resumeAt!+1);await waitFor(()=>p.host.snapshot?.phase==='lobby','fresh lobby after prayer');assert(p.host.snapshot!.members.every(member=>!member.ready&&!member.assetsLoaded));
    p.host.room.send('arena_ready',{raceId,startToken:token});await waitFor(()=>p.host.errors.some(error=>error.code==='ARENA_ACK_REJECTED'),'cancelled arena token cannot start');assert.equal(p.host.snapshot!.phase,'lobby');
   }finally{gate.resolve();beginGate=null;await close(p);}
  });
  await t.test('Personal pause keeps the socket/session; active-window reconnect works and reconnect resets explicit consent',async()=>{
   const p=await pair({leadMs:5000,bots:0});try{
    await start(p);moveTo(Date.parse(p.event!.startedAt)+1);await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','reconnect pause');const token=p.host.room.reconnectionToken,session=p.host.room.sessionId;
    p.host.room.connection.close(1000);await waitFor(()=>p.peer.snapshot?.members.find(member=>member.id===session)?.connected===false,'paused drop');p.host=observe(await client(p.host.userId).reconnect(token),p.host.userId);await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','reconnect during personal window');assert.equal(p.host.room.sessionId,session);
    moveTo(p.host.snapshot!.prayerPause!.resumeEligibleAt+1);consent(p.host);await waitFor(()=>p.peer.snapshot?.prayerPause?.readyIds.includes(session)===true,'pre-drop consent');const again=p.host.room.reconnectionToken;p.host.room.connection.close(1000);await waitFor(()=>p.peer.snapshot?.members.find(member=>member.id===session)?.connected===false,'second drop');p.host=observe(await client(p.host.userId).reconnect(again),p.host.userId);await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','second reconnect');assert(!p.host.snapshot!.prayerPause!.readyIds.includes(session));
    p.peer.room.connection.close(1000);await waitFor(()=>p.host.snapshot?.prayerPause?.requiredIds.length===1,'grace timeout removes departed slot');assert(p.host.snapshot!.racers.find(r=>r.id===p.peer.room.sessionId)!.dnf);
    consent(p.host);await waitFor(()=>p.host.snapshot?.phase==='resume_countdown','fresh consent after reconnect');moveTo(p.host.snapshot!.prayerPause!.resumeAt!+1);await waitFor(()=>p.host.snapshot?.phase==='racing','no deadlock after grace');
   }finally{await close(p);}
  });
  await t.test('Lobby prayer cannot be bypassed with ready/start, a fresh room ticket, or late admission',async()=>{
   const p=await pair({bots:0});try{
    addPrayer(p.host.userId,now());p.host.room.send('ready',{ready:true,assetsLoaded:true});await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','lobby status gate');assert.equal(p.host.snapshot!.prayerPause!.previousPhase,'lobby');p.host.room.send('start');await delay(40);assert.equal(p.host.snapshot!.raceId,null);
    await assert.rejects(client(p.host.userId).create('race',{ticket:ticket(p.host.userId),maxHumans:1,bots:0,loadout:selection}),/PRAYER_BREAK/);
    const other='new-'+randomUUID();await assert.rejects(client(other).joinById(p.host.room.roomId,{ticket:ticket(other),loadout:selection}));assert(p.host.room.connection.isOpen&&p.peer.room.connection.isOpen);assert.deepEqual(p.host.snapshot!.prayerPause!.readyIds,[]);
   }finally{await close(p);}
  });
  await t.test('A departure during the final access recheck cannot strand the remaining ready participants',async()=>{
   const p=await pair({leadMs:5000,bots:0}),gate=deferred(),entered=deferred();try{
    await start(p);moveTo(Date.parse(p.event!.startedAt)+1);await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','final-check pause');moveTo(p.host.snapshot!.prayerPause!.resumeEligibleAt+1);
    consent(p.host);await waitFor(()=>p.host.snapshot?.prayerPause?.readyIds.includes(p.host.room.sessionId)===true,'host already ready');
    lookupHolds.set(p.peer.userId,{entered,gate,skip:1});consent(p.peer);await entered.promise;await p.peer.room.leave();await waitFor(()=>p.host.snapshot?.prayerPause?.requiredIds.length===1,'departed slot removed during final check');gate.resolve();
    await waitFor(()=>p.host.snapshot?.phase==='resume_countdown','remaining consent proceeds without another click');assert.deepEqual(p.host.snapshot!.prayerPause!.readyIds,[p.host.room.sessionId]);
   }finally{gate.resolve();lookupHolds.delete(p.peer.userId);await close(p);}
  });
  await t.test('A delayed pre-boundary allowed response cannot advance physics; a fresh no-event response releases the access hold',async()=>{
   for(const outcome of ['prayer','no-event'] as const){const p=await pair({leadMs:8000,bots:2}),gate=deferred(),entered=deferred();try{
    await start(p);lookupHolds.set(p.host.userId,{entered,gate});moveTo(now()+1700);p.host.room.send('input',{seq:1,throttle:1,brake:0,steer:0,nitro:true});await entered.promise;await delay(40);const frozen=structuredClone(p.host.snapshot!);
    moveTo(Date.parse(p.event!.startedAt)+1);await delay(80);assert.equal(p.host.snapshot!.tick,frozen.tick);assert.equal(p.host.snapshot!.elapsedMs,frozen.elapsedMs);assert.deepEqual(positions(p.host.snapshot!),positions(frozen));
    if(outcome==='no-event')windows.set(p.host.userId,[]);gate.resolve();
    if(outcome==='prayer'){await waitFor(()=>p.host.snapshot?.phase==='prayer_pause','fresh post-boundary status');assert.equal(p.host.snapshot!.tick,frozen.tick);assert.deepEqual(positions(p.host.snapshot!),positions(frozen));}
    else{await waitFor(()=>p.host.snapshot?.phase==='racing'&&p.host.snapshot.tick>frozen.tick,'fresh no-event releases hold');assert.equal(p.host.snapshot!.prayerPause,null);}
   }finally{gate.resolve();lookupHolds.delete(p.host.userId);await close(p);}}
  });
 }finally{(beginGate as ReturnType<typeof deferred>|null)?.resolve();for(const hold of lookupHolds.values())hold.gate.resolve();for(const room of opened)if(room.connection.isOpen)await room.leave().catch(()=>{});await server.gracefullyShutdown(false);}
});
