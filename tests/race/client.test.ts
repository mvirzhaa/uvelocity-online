import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineRace} from '../../client/src/network.js';
import {DEFAULT_VEHICLE_STATS} from '../../shared/catalog.js';
import {freezeLoadout,validateRoomConfig} from '../../shared/config.js';
import {createRacer} from '../../shared/simulation.js';
import {CAR_IDS,type RoomSnapshot} from '../../shared/types.js';
import {RaceRuntime} from '../../server/realtime/RaceRuntime.js';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
class FakeRoom {
 roomId='room-test';sessionId='local';reconnectionToken='room-test:first';connection={isOpen:true};
 reconnection={enabled:true,enqueuedMessages:[] as unknown[],maxEnqueuedMessages:0,minUptime:0,maxRetries:0,maxDelay:0};
 messages=new Map<string,(value:any)=>void>();sent:Array<{type:string;value:any}>=[];leaves=0;onInput?:(input:unknown)=>void;
 private drops:Array<()=>void>=[];private reconnects:Array<()=>void>=[];private exits:Array<()=>void>=[];
 onMessage(type:string,fn:(value:any)=>void){this.messages.set(type,fn);}
 onDrop(fn:()=>void){this.drops.push(fn);}onReconnect(fn:()=>void){this.reconnects.push(fn);}onError(_fn:unknown){}onLeave(fn:()=>void){this.exits.push(fn);}
 send(type:string,value?:any){this.sent.push({type,value});if(type==='input')this.onInput?.(value);}
 emit(type:string,value:any){this.messages.get(type)?.(value);}
 drop(){this.connection.isOpen=false;this.drops.forEach(fn=>fn());}
 reconnect(){this.connection.isOpen=true;this.reconnects.forEach(fn=>fn());this.reconnectionToken='room-test:rotated';}
 async leave(){this.leaves++;this.connection.isOpen=false;this.exits.forEach(fn=>fn());return 1000;}
}
function renderer(){
 const listeners=new Map<string,(value:any)=>void>(),calls:{configure:any[];start:any[];stop:number;models:string[][];local:string[];frames:any[];snapshots:RoomSnapshot[]}={configure:[],start:[],stop:0,models:[],local:[],frames:[],snapshots:[]};
 const game={ready:Promise.resolve(),on(event:string,fn:(value:any)=>void){listeners.set(event,fn);return()=>listeners.delete(event);},
  async configure(value:any){calls.configure.push(value);},async setLocalPlayer(id:string){calls.local.push(id);},async startRace(value:any){calls.start.push(value);},async stopRace(){calls.stop++;},
  applySnapshot(snapshot:RoomSnapshot){calls.snapshots.push(snapshot);},async waitForRaceFrame(options:unknown){calls.frames.push(options);},async ensureModels(ids:string[]){calls.models.push(ids);},getCatalog(){return{cars:CAR_IDS.map(id=>({id,loaded:true}))};},
  async preview(){},async setLoadout(){},setVisible(){},setMuted(){},setCamera(){},async previewEngine(){},focus(){},unlockAudio(){},
 };
 return{game,calls,input:(value:any)=>listeners.get('input')?.(value)};
}
function runtime(){const loadout=freezeLoadout({carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock',stats:DEFAULT_VEHICLE_STATS.brz,tuningVersion:'v1'});return new RaceRuntime(validateRoomConfig({maxHumans:1,bots:0,laps:1,collisionMode:'ghost'}),[createRacer('local','Local',loadout,'u')]);}
function snapshot(sim:RaceRuntime,phase:RoomSnapshot['phase']='racing'):RoomSnapshot{return{protocol:1,roomId:'room-test',inviteCode:'ABC123',raceId:phase==='lobby'?null:'race-test',phase,tick:sim.tick,serverTime:Date.now(),elapsedMs:sim.elapsedMs,startAt:phase==='loading'?null:Date.now(),startToken:phase==='lobby'?null:'attempt-one',loadingDeadline:phase==='loading'?Date.now()+45000:null,prayerPause:null,config:sim.config,rulesetVersion:'v1',trackVersion:'nv-courses-1',physics:sim.physics,hostId:'local',members:[{id:'local',userId:'u',name:'Local',host:true,ready:false,assetsLoaded:false,arenaReady:false,connected:true,loadout:sim.racers[0]!.loadout}],racers:phase==='lobby'?[]:sim.snapshots()};}
function pausedSnapshot(sim:RaceRuntime,token='pause-one'):RoomSnapshot{return{...snapshot(sim,'prayer_pause'),prayerPause:{pauseToken:token,startedAt:Date.now()-901000,resumeEligibleAt:Date.now()-1000,resumeAt:null,previousPhase:'racing',triggers:[{eventId:'prayer-test',userId:'u',displayName:'Local',prayer:'dhuhr',name:'Zuhur',startedAt:Date.now()-901000,resumesAt:Date.now()-1000}],requiredIds:['local'],readyIds:[]}};}

test('Client prediction, renderer readiness and connection lifecycle use the actual room protocol',async t=>{
 const originals=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>(),storage=new Map<string,string>();let frameId=0,clock=performance.now();
 const globals:Record<string,unknown>={location:new URL('http://localhost:3000'),window:new EventTarget(),document:Object.assign(new EventTarget(),{hidden:false}),sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
 for(const[key,value]of Object.entries(globals)){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const advance=(ms:number)=>{clock+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(clock));};
 const setup=()=>{const errors:string[]=[],errorCodes:Array<string|undefined>=[],game=renderer(),room=new FakeRoom(),controller=new OnlineRace({snapshot(){},status(){},error:(message,code)=>{errors.push(message);errorCodes.push(code);},result(){},left(){},ping(){}});controller.bindGame(game.game);(controller as any).attach(room);(controller as any).previous=clock;return{controller,room,...game,errors,errorCodes};};
 try{
  await t.test('Room error codes reach targeted recovery and stale room callbacks are ignored',async()=>{
   const h=setup();try{
    h.room.emit('room_error',{code:'START_FAILED',message:'Start rejected'});
    h.room.emit('room_error',{code:'LOADOUT_REJECTED',message:'Saved appearance changed'});
    assert.deepEqual(h.errors,['Start rejected','Saved appearance changed']);assert.deepEqual(h.errorCodes,['START_FAILED','LOADOUT_REJECTED']);
    await h.controller.leave();h.room.emit('room_error',{code:'LOADOUT_REJECTED',message:'Old room'});assert.equal(h.errors.length,2);
   }finally{h.controller.dispose();await flush();}
  });
  await t.test('Ready is sent only after required human/bot models succeed; unready is immediate',async()=>{
   const h=setup(),sim=runtime(),lobby=snapshot(sim,'lobby');lobby.config={...lobby.config,bots:3,maxHumans:1};h.room.emit('snapshot',lobby);let failed=true;
   h.game.ensureModels=async ids=>{h.calls.models.push(ids);if(failed)throw new Error('Missing Veyron asset');};
   try{
    await assert.rejects(h.controller.ready(true),/Missing Veyron/);assert.equal(h.room.sent.filter(m=>m.type==='ready').length,0);
    failed=false;await h.controller.ready(true);assert.deepEqual(h.calls.models.at(-1),['brz','veyron77','aventador']);assert.deepEqual(h.room.sent.at(-1),{type:'ready',value:{ready:true,assetsLoaded:true}});
    const configured=h.calls.configure.length;await h.controller.ready(false);assert.equal(h.calls.configure.length,configured);assert.deepEqual(h.room.sent.at(-1)!.value,{ready:false,assetsLoaded:false});
    const blocked=deferred();h.game.ensureModels=async()=>blocked.promise;const pending=h.controller.ready(true);await flush();await h.controller.ready(false);blocked.resolve();await pending;
    assert.deepEqual(h.room.sent.at(-1)!.value,{ready:false,assetsLoaded:false},'A pending asset check cannot override a later unready action');
   }finally{h.controller.dispose();await flush();}
  });
  await t.test('Arena acknowledgement waits for models, scene setup, applied grid, actual frame and visible document',async()=>{
   const h=setup(),models=deferred(),started=deferred(),frame=deferred(),visibleFrame=deferred();
   h.game.ensureModels=async ids=>{h.calls.models.push(ids);await models.promise;};h.game.startRace=async value=>{h.calls.start.push(value);await started.promise;};
   h.game.waitForRaceFrame=async value=>{h.calls.frames.push(value);assert.equal(h.calls.snapshots.at(-1)?.phase,'loading');await(h.calls.frames.length===1?frame.promise:visibleFrame.promise);};
   try{
    h.room.emit('snapshot',snapshot(runtime(),'loading'));await flush();advance(40);assert.equal(h.calls.start.length,0);assert.equal(h.room.sent.some(m=>m.type==='input'||m.type==='arena_ready'),false);
    models.resolve();await flush();assert.equal(h.calls.start.length,1);assert.equal(h.calls.start[0].phase,'loading');assert.equal(h.calls.frames.length,0);
    started.resolve();await flush();assert.equal(h.calls.frames.length,1);assert.equal(h.calls.frames[0].startToken,'attempt-one');assert.equal(h.calls.frames[0].minimumTick,0);assert.equal(h.room.sent.some(m=>m.type==='arena_ready'),false);
    (document as any).hidden=true;frame.resolve();await flush();assert.equal(h.room.sent.some(m=>m.type==='arena_ready'),false,'A frame completed while hidden cannot release everyone');
    (document as any).hidden=false;document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(h.calls.frames.length,2);visibleFrame.resolve();await flush();
    assert.deepEqual(h.room.sent.filter(m=>m.type==='arena_ready'),[{type:'arena_ready',value:{raceId:'race-test',startToken:'attempt-one'}}]);
    h.room.emit('snapshot',snapshot(runtime(),'loading'));await flush();assert.equal(h.room.sent.filter(m=>m.type==='arena_ready').length,1);assert.equal(h.room.sent.filter(m=>m.type==='input').length,0);
   }finally{(document as any).hidden=false;models.resolve();started.resolve();frame.resolve();visibleFrame.resolve();h.controller.dispose();await flush();}
  });
  await t.test('Cancelled loading releases a hung models/start/frame promise and permits a fresh attempt',async()=>{
   for(const stage of ['models','start','frame'] as const){
    const h=setup(),blocked=deferred();let first=true;
    if(stage==='models')h.game.ensureModels=async ids=>{h.calls.models.push(ids);if(first){first=false;await blocked.promise;}};
    if(stage==='start')h.game.startRace=async value=>{h.calls.start.push(value);if(first){first=false;await blocked.promise;}};
    if(stage==='frame')h.game.waitForRaceFrame=async value=>{h.calls.frames.push(value);if(first){first=false;await blocked.promise;}};
    try{
     h.room.emit('snapshot',snapshot(runtime(),'loading'));await flush();assert.equal(h.room.sent.some(m=>m.type==='arena_ready'),false);
     h.room.emit('snapshot',snapshot(runtime(),'lobby'));await flush();assert.equal(h.calls.stop,1,'stopRace is not queued forever behind '+stage);
     const next={...snapshot(runtime(),'loading'),raceId:'race-second',startToken:'attempt-two'};h.room.emit('snapshot',next);await flush();
     assert.deepEqual(h.room.sent.filter(m=>m.type==='arena_ready').map(m=>m.value),[{raceId:'race-second',startToken:'attempt-two'}]);
     blocked.resolve();await flush();assert.equal(h.room.sent.some(m=>m.type==='arena_ready'&&m.value.startToken==='attempt-one'),false);assert.equal(h.room.sent.some(m=>m.type==='arena_failed'),false,'Cancelled callbacks do not fail a new attempt');
     if(stage==='models')assert.equal(h.calls.start.some(value=>value.raceId==='race-test'),false,'Late model completion cannot start an old scene');
    }finally{blocked.resolve();h.controller.dispose();await flush();}
   }
  });
  await t.test('Missing frame API fails the barrier; readiness can be withdrawn only in lobby/loading',async()=>{
   const h=setup();try{
    Reflect.deleteProperty(h.game,'waitForRaceFrame');h.room.emit('snapshot',snapshot(runtime(),'loading'));await flush();
    assert.equal(h.room.sent.some(m=>m.type==='arena_ready'),false);assert.equal(h.room.sent.filter(m=>m.type==='arena_failed').length,1);assert.equal(h.errorCodes.at(-1),'ARENA_LOAD_FAILED');
    await h.controller.ready(true);assert.equal(h.room.sent.some(m=>m.type==='ready'),false);
    await h.controller.ready(false);assert.deepEqual(h.room.sent.at(-1),{type:'ready',value:{ready:false,assetsLoaded:false}});
    h.room.emit('snapshot',snapshot(runtime(),'countdown'));await h.controller.ready(false);assert.equal(h.room.sent.filter(m=>m.type==='ready').length,1);
   }finally{h.controller.dispose();await flush();}
  });
  await t.test('Expired prayer pause never auto-consents and paused keys never become replayed driving controls',async()=>{
   const h=setup(),sim=runtime();try{
    h.room.emit('snapshot',snapshot(sim));await flush();h.input({throttle:1,brake:0,steer:1,nitro:true});advance(25);const count=h.room.sent.filter(m=>m.type==='input').length;
    const paused=pausedSnapshot(sim);h.room.emit('snapshot',paused);await flush();h.input({throttle:1,brake:0,steer:1,nitro:true,reset:true});advance(100);
    assert.equal(h.room.sent.filter(m=>m.type==='input').length,count);assert.equal(h.room.sent.some(m=>m.type==='resume_ready'),false);assert.equal((h.controller as any).pending.length,0);assert.equal(h.room.leaves,0);assert(storage.has('uvelocity:reconnect'),'Prayer never clears the reconnect token');
    h.room.emit('snapshot',{...paused,phase:'resume_countdown',prayerPause:{...paused.prayerPause!,resumeAt:Date.now()+3000}});advance(100);assert.equal(h.room.sent.filter(m=>m.type==='input').length,count);
    h.room.emit('snapshot',snapshot(sim));(h.controller as any).previous=clock;advance(25);const resumed=h.room.sent.filter(m=>m.type==='input').slice(count);assert(resumed.length>0);assert(resumed.every(m=>m.value.throttle===0&&m.value.steer===0&&!m.value.nitro&&!m.value.reset));
   }finally{h.controller.dispose();await flush();}
  });
  await t.test('Resume consent Promise awaits a prepared visible arena frame; no-frame renderer reports a clear failure',async()=>{
   const h=setup(),frame=deferred();h.game.waitForRaceFrame=async value=>{h.calls.frames.push(value);await frame.promise;};
   try{
    h.room.emit('snapshot',pausedSnapshot(runtime()));await flush();let completed=false;const pending=h.controller.resumeReady().then(()=>{completed=true;});await flush();assert.equal(completed,false);assert.equal(h.calls.frames[0].minimumTick,0);assert.equal(h.room.sent.some(m=>m.type==='resume_ready'),false);
    frame.resolve();await pending;assert.deepEqual(h.room.sent.filter(m=>m.type==='resume_ready'),[{type:'resume_ready',value:{pauseToken:'pause-one'}}]);
    Reflect.deleteProperty(h.game,'waitForRaceFrame');await assert.rejects(h.controller.resumeReady(),/arena/);assert.equal(h.errorCodes.at(-1),'RESUME_NOT_READY');assert.equal(h.room.sent.filter(m=>m.type==='resume_ready').length,1);
   }finally{frame.resolve();h.controller.dispose();await flush();}
  });
  await t.test('A pre-drop, old-token or old-renderer resume click cannot become consent after state changes',async()=>{
   for(const change of ['drop','token','renderer'] as const){
    const h=setup(),frame=deferred();h.game.waitForRaceFrame=async value=>{h.calls.frames.push(value);await frame.promise;};
    try{
     const paused=pausedSnapshot(runtime());h.room.emit('snapshot',paused);await flush();const oldClick=h.controller.resumeReady();await flush();assert.equal(h.calls.frames.length,1);
     if(change==='drop'){h.room.drop();h.room.reconnect();await flush();h.room.emit('snapshot',paused);}
     if(change==='token')h.room.emit('snapshot',pausedSnapshot(runtime(),'pause-two'));
     if(change==='renderer')h.controller.bindGame(renderer().game);
     await oldClick;frame.resolve();await flush();assert.equal(h.room.sent.some(m=>m.type==='resume_ready'),false,'A stale '+change+' click cannot acknowledge');
     await h.controller.resumeReady();assert.deepEqual(h.room.sent.filter(m=>m.type==='resume_ready').map(m=>m.value.pauseToken),[change==='token'?'pause-two':'pause-one']);
    }finally{frame.resolve();h.controller.dispose();await flush();}
   }
  });
  await t.test('Leaving during an awaited renderer configure cannot start an abandoned race',async()=>{
   const h=setup(),blocked=deferred();h.game.configure=async value=>{h.calls.configure.push(value);await blocked.promise;};
   h.room.emit('snapshot',snapshot(runtime(),'countdown'));await flush();assert.equal(h.calls.configure.length,1);
   await h.controller.leave();blocked.resolve();await flush();assert.equal(h.calls.start.length,0);assert.equal(h.calls.stop,1);assert.equal(h.room.leaves,1);assert.equal(frames.size,0);
   h.room.emit('snapshot',snapshot(runtime()));await flush();assert.equal(h.calls.start.length,0);h.controller.dispose();await flush();
  });
  await t.test('Batched prediction replays unacknowledged steps; reconnect clears controls and saves rotated token',async()=>{
   const h=setup(),sim=runtime();h.room.onInput=input=>sim.acceptInput('local',input);h.room.emit('snapshot',snapshot(sim));await flush();assert.equal(h.calls.start.length,1);assert.equal(h.calls.start[0].localRacerId,'local');assert.equal(h.calls.start[0].loadouts[0].loadout.carId,'brz');
   try{
    h.input({throttle:1,brake:0,steer:0,nitro:false});advance(50);const commands=h.room.sent.filter(m=>m.type==='input');assert.equal(commands.length,4);assert.deepEqual(commands.map(m=>m.value.clientTick),[1,2,3,4]);
    const predicted={...(h.controller as any).prediction};sim.step();assert.equal(sim.racers[0]!.lastProcessedSeq,1);h.room.emit('snapshot',snapshot(sim));
    assert.equal((h.controller as any).pending.length,3);assert.ok(Math.hypot(predicted.x-(h.controller as any).prediction.x,predicted.z-(h.controller as any).prediction.z)<1e-10);
    assert.ok(Math.abs((h.controller as any).predictionElapsed-4000/90)<1e-8);
    sim.setConnected('local',false);h.room.drop();assert.equal(h.controller.connected,false);advance(100);assert.equal(h.room.sent.filter(m=>m.type==='input').length,4);
    h.room.reconnect();await flush();assert.equal(storage.get('uvelocity:reconnect'),'room-test:rotated');advance(50);assert.equal(h.room.sent.filter(m=>m.type==='input').length,4,'No input before fresh server state');
    sim.setConnected('local',true);h.room.emit('snapshot',snapshot(sim));(h.controller as any).previous=clock;advance(25);const next=h.room.sent.filter(m=>m.type==='input').slice(4);assert.ok(next.length>0);assert.ok(next.every(m=>m.value.seq>4&&m.value.throttle===0&&m.value.brake===0));
    h.controller.neutral();assert.equal(h.room.sent.at(-1)!.value.brake,0,'Blur cannot latch reverse');assert.equal(h.errors.length,0);
   }finally{h.controller.dispose();await flush();assert.equal(h.room.leaves,1);assert.equal(frames.size,0);}
  });
  await t.test('Disposing while a room request is pending closes its eventual socket',async()=>{
   const h=setup();await h.controller.leave();const pending=deferred<any>(),connecting=(h.controller as any).connect(()=>pending.promise),orphan=new FakeRoom();h.controller.dispose();pending.resolve(orphan);await assert.rejects(connecting,/dibatalkan/);assert.equal(orphan.leaves,1);assert.equal(frames.size,0);await flush();
  });
 }finally{for(const[key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
