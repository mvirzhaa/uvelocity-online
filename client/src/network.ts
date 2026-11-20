import {Client, type Room} from '@colyseus/sdk';
import {CAR_IDS, type RoomConfig, type RoomSnapshot, type RacerSnapshot, type VehicleInput, type RaceResult, type RaceSettlement} from '../../shared/types.js';
import {advanceVehicle, shortestAngle} from '../../shared/simulation.js';
import {getTrack} from '../../shared/track.js';
import {api, type Loadout} from './api.js';
import type {Controls, GameAPI} from './game.js';

type ResultMessage={result:RaceResult;reward:RaceSettlement['rewards'][number]|null};
type Handler={snapshot:(snapshot:RoomSnapshot)=>void;status:(value:string)=>void;error:(message:string)=>void;result:(payload:ResultMessage)=>void;left:()=>void;ping:(ms:number)=>void};
type ReadyGame=GameAPI&{ensureModels?:(ids:string[])=>Promise<unknown>;getCatalog?:()=>{cars:Array<{id:string;loaded:boolean;branded?:boolean}>}};
const NEUTRAL:Controls={throttle:0,brake:0,steer:0,nitro:false};
const TOKEN_KEY='uvelocity:reconnect';
const MAX_PENDING=180;
const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

/** Sequenced fixed-step controls go to the authoritative room. Only movement is
 * predicted locally; race progress, finishes, loadouts and rewards stay server-owned. */
export class OnlineRace {
 private client=new Client(location.origin + BASE_PATH);
 private room:Room<any,any>|null=null;
 private game:GameAPI|null=null;
 private latest:RoomSnapshot|null=null;
 private snapshots:RoomSnapshot[]=[];
 private controls:Controls={...NEUTRAL};
 private seq=0;
 private pending:VehicleInput[]=[];
 private prediction:RacerSnapshot|null=null;
 private predictionElapsed=0;
 private visual:RacerSnapshot|null=null;
 private frame=0;
 private pingTimer:ReturnType<typeof setInterval>|null=null;
 private previous=0;
 private accumulator=0;
 private startedRace:string|null=null;
 private preparing:{generation:number;raceId:string}|null=null;
 private failedRace:string|null=null;
 private resultRaceId:string|null=null;
 private readiness=0;
 private rendererQueue:Promise<unknown>=Promise.resolve();
 private disconnected=false;
 private awaitingSync=true;
 private disposed=false;
 private unsubInput:(()=>void)|null=null;
 private generation=0;
 private connectAttempt=0;
 private connecting=false;
 private clockOffset=0;
 private clockMeasured=false;
 private lastUI=-Infinity;

 constructor(private handlers:Handler){
  window.addEventListener('blur',this.neutral);
  document.addEventListener('visibilitychange',this.visibility);
 }
 get sessionId(){return this.room?.sessionId??'';}
 get connected(){return !!this.room&&!this.disconnected&&this.room.connection.isOpen;}
 bindGame(game:GameAPI){
  if(this.disposed||this.game===game)return;
  this.unsubInput?.();
  const old=this.game;
  if(old&&old!==game)void this.enqueueRenderer(async()=>{await old.stopRace();}).catch(()=>{});
  this.game=game;this.startedRace=null;this.preparing=null;this.failedRace=null;
  this.unsubInput=game.on('input',(input:Controls)=>{
   if(this.disconnected||document.hidden){this.controls={...NEUTRAL};return;}
   this.controls={throttle:input.throttle,brake:input.brake,steer:input.steer,nitro:input.nitro,reset:this.controls.reset===true||input.reset===true};
  });
  if(this.latest)void this.prepareRenderer(this.latest);
 }
 async create(config:RoomConfig,loadout:Loadout){
  await this.connect(async()=>{const {ticket}=await api<{ticket:string}>('/race/ticket','POST');return this.client.create('race',{ticket,...config,loadout});});
 }
 async join(code:string,loadout:Loadout){
  await this.connect(async()=>{
   const info=await api<{roomId:string;joinable:boolean}>('/rooms/'+encodeURIComponent(code.trim().toUpperCase()));
   if(!info.joinable)throw new Error('Ruang ini sudah memulai balapan atau penuh.');
   const {ticket}=await api<{ticket:string}>('/race/ticket','POST');return this.client.joinById(info.roomId,{ticket,loadout});
  });
 }
 async restore(){
  const token=this.readToken();if(!token)return false;
  try{await this.connect(()=>this.client.reconnect(token));return true;}
  catch{if(this.readToken()===token)this.saveToken(null);return false;}
 }
 private async connect(create:()=>Promise<Room<any,any>>){
  if(this.disposed)throw new Error('Sesi balapan sudah ditutup.');
  if(this.room||this.connecting)throw new Error('Keluar dari room saat ini sebelum membuka room lain.');
  this.connecting=true;const attempt=++this.connectAttempt;
  try{
   const room=await create();
   if(this.disposed||attempt!==this.connectAttempt){await room.leave(true).catch(()=>{});throw new Error('Penyambungan dibatalkan.');}
   this.attach(room);
  }finally{if(attempt===this.connectAttempt)this.connecting=false;}
 }
 private readToken(){try{return sessionStorage.getItem(TOKEN_KEY);}catch{return null;}}
 private saveToken(value:string|null){try{if(value)sessionStorage.setItem(TOKEN_KEY,value);else sessionStorage.removeItem(TOKEN_KEY);}catch{/* Storage may be disabled; live reconnection still works. */}}
 private attach(room:Room<any,any>){
  if(this.room){const previous=this.cleanup();void previous?.leave(true).catch(()=>{});}
  this.room=room;this.disconnected=false;this.awaitingSync=true;this.seq=0;this.pending=[];this.snapshots=[];this.latest=null;
  this.prediction=this.visual=null;this.controls={...NEUTRAL};this.accumulator=0;this.startedRace=null;this.preparing=null;this.failedRace=null;this.resultRaceId=null;
  this.clockMeasured=false;this.lastUI=-Infinity;const generation=++this.generation;
  const current=()=>this.room===room&&generation===this.generation&&!this.disposed;
  room.reconnection.minUptime=0;room.reconnection.maxRetries=12;room.reconnection.maxDelay=2500;room.reconnection.maxEnqueuedMessages=0;
  this.saveToken(room.reconnectionToken);this.handlers.status('Tersambung');
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{if(current())this.accept(snapshot);});
  room.onMessage('room_error',(error:{code:string;message:string})=>{
   if(!current())return;this.handlers.error(error.message);
   if(error.code==='SESSION_EXPIRED'){room.reconnection.enabled=false;this.saveToken(null);void room.leave(true).catch(()=>{});}
  });
  room.onMessage('result',(payload:ResultMessage)=>{if(current()&&payload.result.raceId!==this.resultRaceId){this.resultRaceId=payload.result.raceId;this.handlers.result(payload);}});
  room.onMessage('pong',(payload:{sentAt:number;serverTime:number})=>{
   if(!current())return;const rtt=Date.now()-payload.sentAt;
   if(!Number.isFinite(rtt)||rtt<0||rtt>30000||!Number.isFinite(payload.serverTime))return;
   const offset=payload.serverTime+rtt/2-Date.now();this.clockOffset=this.clockMeasured?this.clockOffset*.8+offset*.2:offset;this.clockMeasured=true;this.handlers.ping(Math.round(rtt));
  });
  room.onDrop(()=>{
   if(!current())return;this.disconnected=true;this.awaitingSync=true;this.controls={...NEUTRAL};this.pending=[];this.accumulator=0;room.reconnection.enqueuedMessages=[];
   this.handlers.status('Menyambungkan kembali…');
  });
  room.onReconnect(()=>{
   if(!current())return;this.disconnected=false;this.awaitingSync=true;this.pending=[];this.snapshots=[];this.controls={...NEUTRAL};this.accumulator=0;this.previous=performance.now();
   this.handlers.status('Tersambung kembali');
   // SDK0.18 rotates reconnectionToken after invoking this callback and then
   // acknowledges the join. Wait one microtask before saving it or sending sync.
   queueMicrotask(()=>{if(current()){this.saveToken(room.reconnectionToken);room.send('sync');}});
  });
  room.onError((_code,message)=>{if(current())this.handlers.error(message??'Koneksi balapan mengalami gangguan.');});
  room.onLeave(()=>{if(current()){this.cleanup();this.handlers.left();}});
  room.send('sync');room.send('ping',{sentAt:Date.now()});
  this.pingTimer=setInterval(()=>{if(current()&&this.connected)room.send('ping',{sentAt:Date.now()});},2000);
  this.previous=performance.now();this.frame=requestAnimationFrame(this.render);
 }
 private accept(snapshot:RoomSnapshot){
  if(snapshot.protocol!==1||snapshot.roomId!==this.room?.roomId)return;
  if(this.latest&&snapshot.raceId===this.latest.raceId&&snapshot.tick<this.latest.tick)return;
  const oldPhase=this.latest?.phase,newRace=this.latest?.raceId!==snapshot.raceId;
  if(snapshot.phase==='aborted'&&oldPhase!=='aborted')this.handlers.error(snapshot.settlementError??'Balapan dibatalkan oleh server.');
  if(newRace){this.snapshots=[];this.pending=[];this.prediction=this.visual=null;this.accumulator=0;this.failedRace=null;}
  this.latest=snapshot;this.awaitingSync=false;this.snapshots.push(snapshot);if(this.snapshots.length>12)this.snapshots.shift();
  if(!this.clockMeasured)this.clockOffset=snapshot.serverTime-Date.now();
  const own=snapshot.racers.find(r=>r.id===this.sessionId);
  if(own){
   this.seq=Math.max(this.seq,own.lastProcessedSeq);this.pending=this.pending.filter(input=>input.seq>own.lastProcessedSeq).slice(-MAX_PENDING);
   this.prediction=structuredClone(own);this.predictionElapsed=snapshot.elapsedMs;
   if(snapshot.phase==='racing'&&!own.finished&&!own.dnf&&own.connected){
    const track=getTrack(snapshot.config.circuit),step=1/snapshot.physics.tickRate;
    for(const input of this.pending){this.predictionElapsed+=step*1000;advanceVehicle(this.prediction,input,track,own.loadout.stats,step,this.predictionElapsed,snapshot.physics);}
   }else{this.pending=[];this.controls={...NEUTRAL};}
   if(!this.visual||own.finished||own.dnf||this.visual.lastResetMs!==this.prediction.lastResetMs||Math.hypot(this.visual.x-this.prediction.x,this.visual.z-this.prediction.z)>12)this.visual=structuredClone(this.prediction);
  }
  void this.prepareRenderer(snapshot);
  const now=performance.now();if(now-this.lastUI>120||oldPhase!==snapshot.phase){this.lastUI=now;this.handlers.snapshot(snapshot);}
 }
 private enqueueRenderer<T>(task:()=>Promise<T>):Promise<T>{
  const operation=this.rendererQueue.then(task,task);this.rendererQueue=operation.then(()=>undefined,()=>undefined);return operation;
 }
 private async ensureModels(game:GameAPI,ids:string[]){
  const readyGame=game as ReadyGame,required=[...new Set(ids)];
  if(readyGame.ensureModels){await readyGame.ensureModels(required);return;}
  const cars=readyGame.getCatalog?.().cars;
  if(!cars)throw new Error('Status model kendaraan belum tersedia.');
  const missing=required.filter(id=>!cars.some(car=>car.id===id&&car.loaded));
  if(missing.length)throw new Error('Model belum tersedia: '+missing.join(', ')+'. Muat ulang halaman untuk mencoba lagi.');
 }
 private async prepareRenderer(snapshot:RoomSnapshot){
  const game=this.game,room=this.room,raceId=snapshot.raceId;
  if(!game||!room||!raceId||!snapshot.racers.length||['lobby','loading'].includes(snapshot.phase)||this.startedRace===raceId||this.preparing?.raceId===raceId||this.failedRace===raceId)return;
  const preparation={generation:this.generation,raceId};this.preparing=preparation;
  const current=()=>!this.disposed&&this.game===game&&this.room===room&&this.generation===preparation.generation&&this.latest?.raceId===raceId;
  try{
   await this.enqueueRenderer(async()=>{
    if(!current())return;await game.ready;if(!current())return;
    await this.ensureModels(game,snapshot.racers.map(r=>r.loadout.carId));if(!current())return;
    await game.configure({...snapshot.config,online:true,previewOnly:false});if(!current())return;
    await game.setLocalPlayer(room.sessionId);if(!current())return;
    await game.startRace({raceId,config:snapshot.config,localRacerId:room.sessionId,loadouts:snapshot.racers.map(r=>({id:r.id,name:r.name,loadout:r.loadout,isBot:r.isBot}))});
    if(current()){this.startedRace=raceId;game.applySnapshot(this.latest!);}
   });
  }catch(error){if(current()){this.failedRace=raceId;this.handlers.error('Lintasan belum siap: '+(error as Error).message);}}
  finally{if(this.preparing===preparation)this.preparing=null;}
 }
 private render=(now:number)=>{
  if(!this.room||this.disposed)return;
  const dt=Math.max(0,Math.min(.1,(now-this.previous)/1000));this.previous=now;const snapshot=this.latest;
  if(snapshot?.phase==='racing'&&this.prediction&&!this.prediction.finished&&!this.prediction.dnf&&this.prediction.connected&&!this.disconnected&&!this.awaitingSync&&!document.hidden){
   const step=1/snapshot.physics.tickRate;this.accumulator=Math.min(.12,this.accumulator+dt);const track=getTrack(snapshot.config.circuit);
   while(this.accumulator>=step&&this.pending.length<MAX_PENDING){
    const input:VehicleInput={seq:++this.seq,...this.controls,clientTick:snapshot.tick+this.pending.length+1};
    this.room.send('input',input);this.predictionElapsed+=step*1000;
    advanceVehicle(this.prediction,input,track,this.prediction.loadout.stats,step,this.predictionElapsed,snapshot.physics);
    this.pending.push(input);this.controls.reset=false;this.accumulator-=step;
   }
   if(this.pending.length>=MAX_PENDING)this.accumulator=0;
  }else this.accumulator=0;
  if(snapshot&&this.game&&this.startedRace===snapshot.raceId){
   const serverNow=Date.now()+this.clockOffset,targetTime=serverNow-100;
   let a=this.snapshots[0]??snapshot,b=this.snapshots.at(-1)??snapshot;
   if(targetTime<=a.serverTime)b=a;
   else for(let i=1;i<this.snapshots.length;i++)if(this.snapshots[i]!.serverTime>=targetTime){a=this.snapshots[i-1]!;b=this.snapshots[i]!;break;}
   const alpha=Math.min(1,Math.max(0,(targetTime-a.serverTime)/Math.max(1,b.serverTime-a.serverTime)));
   const racers=snapshot.racers.map(racer=>{
    if(racer.id===this.sessionId){
     if(this.prediction&&this.visual&&snapshot.phase==='racing'&&!racer.finished&&!racer.dnf&&racer.connected&&!this.disconnected&&!this.awaitingSync){
      const p=this.prediction,v=this.visual,blend=1-Math.exp(-dt*24);
      const snap=v.lastResetMs!==p.lastResetMs,x=snap?p.x:v.x+(p.x-v.x)*blend,z=snap?p.z:v.z+(p.z-v.z)*blend,heading=snap?p.heading:v.heading+shortestAngle(p.heading-v.heading)*blend;
      this.visual={...p,x,z,heading};
      return{...racer,x,z,heading,speed:p.speed,steerAngle:p.steerAngle,driftAngle:p.driftAngle,bodyRoll:p.bodyRoll,bodyPitch:p.bodyPitch,nitro:p.nitro,nitroActive:p.nitroActive,trackIdx:p.trackIdx,trackT:p.trackT};
     }
     return racer;
    }
    const ar=a.racers.find(p=>p.id===racer.id),br=b.racers.find(p=>p.id===racer.id);if(!ar||!br||racer.finished||racer.dnf)return racer;
    return{...racer,x:ar.x+(br.x-ar.x)*alpha,z:ar.z+(br.z-ar.z)*alpha,heading:ar.heading+shortestAngle(br.heading-ar.heading)*alpha,steerAngle:ar.steerAngle+(br.steerAngle-ar.steerAngle)*alpha};
   });
   const extrapolation=snapshot.phase==='racing'?Math.min(250,Math.max(0,serverNow-snapshot.serverTime)):0;
   try{this.game.applySnapshot({...snapshot,serverTime:serverNow,elapsedMs:snapshot.elapsedMs+extrapolation,racers});}
   catch(error){this.startedRace=null;this.failedRace=snapshot.raceId;this.handlers.error('Tampilan balapan mengalami gangguan: '+(error as Error).message);}
  }
  this.frame=requestAnimationFrame(this.render);
 };
 async ready(value:boolean){
  const room=this.room,game=this.game,generation=this.generation,readiness=++this.readiness;
  if(!room||!this.connected)throw new Error('Sambungan room belum siap.');
  if(this.latest?.phase!=='lobby')return;
  if(!value){room.send('ready',{ready:false,assetsLoaded:false});return;}
  if(!game)throw new Error('Tunggu model 3D selesai dimuat.');
  const current=()=>this.room===room&&this.game===game&&this.generation===generation&&this.readiness===readiness&&!this.disposed&&this.latest?.phase==='lobby';
  await this.enqueueRenderer(async()=>{
   await game.ready;if(!current())return;
   const snapshot=this.latest!,required=[...snapshot.members.map(m=>m.loadout.carId),...Array.from({length:snapshot.config.bots},(_,i)=>CAR_IDS[i%CAR_IDS.length]!)];
   await this.ensureModels(game,required);if(!current())return;
   await game.configure({circuit:snapshot.config.circuit,previewOnly:true,online:true});
   if(current()&&this.connected)room.send('ready',{ready:true,assetsLoaded:true});
  });
 }
 start(){if(this.connected)this.room?.send('start');}
 setLoadout(loadout:Loadout){if(this.connected)this.room?.send('loadout',loadout);}
 neutral=()=>{
  this.controls={...NEUTRAL};
  // Zero controls immediately release throttle. Holding brake here would make
  // a stationary arcade car reverse while a window is blurred.
  if(this.connected&&!this.awaitingSync&&this.latest?.phase==='racing')this.room!.send('input',{...NEUTRAL,seq:++this.seq});
 };
 private visibility=()=>{if(document.hidden)this.neutral();else if(this.connected){this.accumulator=0;this.previous=performance.now();this.room?.send('sync');}};
 async leave(){
  const room=this.cleanup();if(room)await room.leave(true).catch(()=>{});this.handlers.left();
 }
 private cleanup(){
  const room=this.room,game=this.game;this.generation++;this.connectAttempt++;this.readiness++;this.connecting=false;
  this.room=null;this.disconnected=false;this.awaitingSync=true;this.latest=null;this.snapshots=[];this.prediction=this.visual=null;this.pending=[];this.controls={...NEUTRAL};this.accumulator=0;
  this.startedRace=null;this.preparing=null;this.failedRace=null;cancelAnimationFrame(this.frame);
  if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer=null;this.saveToken(null);
  if(game)void this.enqueueRenderer(async()=>{await game.stopRace();}).catch(()=>{});
  return room;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;const room=this.cleanup();if(room){room.reconnection.enabled=false;void room.leave(true).catch(()=>{});}
  this.unsubInput?.();this.unsubInput=null;window.removeEventListener('blur',this.neutral);document.removeEventListener('visibilitychange',this.visibility);
 }
}
