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
 const listeners=new Map<string,(value:any)=>void>(),calls:{configure:any[];start:any[];stop:number;models:string[][];local:string[]}={configure:[],start:[],stop:0,models:[],local:[]};
 const game={ready:Promise.resolve(),on(event:string,fn:(value:any)=>void){listeners.set(event,fn);return()=>listeners.delete(event);},
  async configure(value:any){calls.configure.push(value);},async setLocalPlayer(id:string){calls.local.push(id);},async startRace(value:any){calls.start.push(value);},async stopRace(){calls.stop++;},
  applySnapshot(_snapshot:RoomSnapshot){},async ensureModels(ids:string[]){calls.models.push(ids);},getCatalog(){return{cars:CAR_IDS.map(id=>({id,loaded:true}))};},
  async preview(){},async setLoadout(){},setVisible(){},setMuted(){},setCamera(){},async previewEngine(){},focus(){},unlockAudio(){},
 };
 return{game,calls,input:(value:any)=>listeners.get('input')?.(value)};
}
function runtime(){const loadout=freezeLoadout({carId:'brz',color:'#2866b8',finish:'metallic',rimId:'stock',stats:DEFAULT_VEHICLE_STATS.brz,tuningVersion:'v1'});return new RaceRuntime(validateRoomConfig({maxHumans:1,bots:0,laps:1,collisionMode:'ghost'}),[createRacer('local','Local',loadout,'u')]);}
function snapshot(sim:RaceRuntime,phase:RoomSnapshot['phase']='racing'):RoomSnapshot{return{protocol:1,roomId:'room-test',inviteCode:'ABC123',raceId:phase==='lobby'?null:'race-test',phase,tick:sim.tick,serverTime:Date.now(),elapsedMs:sim.elapsedMs,startAt:Date.now(),config:sim.config,rulesetVersion:'v1',trackVersion:'nv-courses-1',physics:sim.physics,hostId:'local',members:[{id:'local',userId:'u',name:'Local',host:true,ready:false,assetsLoaded:false,connected:true,loadout:sim.racers[0]!.loadout}],racers:phase==='lobby'?[]:sim.snapshots()};}

test('Client prediction, renderer readiness and connection lifecycle use the actual room protocol',async t=>{
 const originals=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>(),storage=new Map<string,string>();let frameId=0,clock=performance.now();
 const globals:Record<string,unknown>={location:new URL('http://localhost:3000'),window:new EventTarget(),document:Object.assign(new EventTarget(),{hidden:false}),sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:(id:number)=>frames.delete(id)};
 for(const[key,value]of Object.entries(globals)){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const advance=(ms:number)=>{clock+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(clock));};
 const setup=()=>{const errors:string[]=[],game=renderer(),room=new FakeRoom(),controller=new OnlineRace({snapshot(){},status(){},error:message=>errors.push(message),result(){},left(){},ping(){}});controller.bindGame(game.game);(controller as any).attach(room);(controller as any).previous=clock;return{controller,room,...game,errors};};
 try{
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
