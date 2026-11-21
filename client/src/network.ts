import {Client, type Room} from '@colyseus/sdk';
import {CAR_IDS, type RoomConfig, type RoomSnapshot, type RacerSnapshot, type VehicleInput, type RaceResult, type RaceSettlement} from '../../shared/types.js';
import {advanceVehicle, shortestAngle} from '../../shared/simulation.js';
import {getTrack} from '../../shared/track.js';
import {api, type Loadout} from './api.js';
import type {Controls, GameAPI} from './game.js';

type ResultMessage={result:RaceResult;reward:RaceSettlement['rewards'][number]|null};
type Handler={snapshot:(snapshot:RoomSnapshot)=>void;status:(value:string)=>void;error:(message:string,code?:string)=>void;result:(payload:ResultMessage)=>void;left:()=>void;ping:(ms:number)=>void};
type ReadyGame=GameAPI&{ensureModels?:(ids:string[])=>Promise<unknown>;getCatalog?:()=>{cars:Array<{id:string;loaded:boolean;branded?:boolean}>}};
const NEUTRAL:Controls={throttle:0,brake:0,steer:0,nitro:false};
const TOKEN_KEY='uvelocity:reconnect';
const MAX_PENDING=180;

/** Only post-finish samples may move a finisher visually. The first finished
 * sample anchors the transition, so the interpolation delay cannot rewind a
 * newly finished car behind the line. Official score fields always stay latest. */
function interpolateFinisher(racer:RacerSnapshot,snapshots:readonly RoomSnapshot[],targetTime:number):RacerSnapshot {
 let a:{racer:RacerSnapshot;time:number}|undefined,b:typeof a;
 for(const snapshot of snapshots){
  if(snapshot.phase!=='racing')continue;
  const sampled=snapshot.racers.find(value=>value.id===racer.id);
  if(!sampled?.finished||sampled.dnf||sampled.finishTimeMs!==racer.finishTimeMs)continue;
  const sample={racer:sampled,time:snapshot.serverTime};
  if(!a||snapshot.serverTime<=targetTime)a=sample;
  b=sample;if(snapshot.serverTime>=targetTime)break;
 }
 if(!a||!b)return racer;
 const alpha=Math.min(1,Math.max(0,(targetTime-a.time)/Math.max(1,b.time-a.time))),from=a.racer,to=b.racer;
 return{...racer,x:from.x+(to.x-from.x)*alpha,z:from.z+(to.z-from.z)*alpha,
  heading:from.heading+shortestAngle(to.heading-from.heading)*alpha,speed:from.speed+(to.speed-from.speed)*alpha,
  steerAngle:from.steerAngle+(to.steerAngle-from.steerAngle)*alpha};
}

/** Release the renderer queue when an attempt is cancelled even if a network
 * asset promise never settles. Late promise outcomes are consumed safely. */
function abortable<T>(operation:Promise<T>|T,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason??Object.assign(new Error('Persiapan dibatalkan.'),{name:'AbortError'}));
  if(signal.aborted){Promise.resolve(operation).catch(()=>{});abort();return;}
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(operation).then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}

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
 private preparing:{generation:number;raceId:string;abort:AbortController}|null=null;
 private arenaWaiting:{raceId:string;token:string;abort:AbortController}|null=null;
 private arenaAckedToken:string|null=null;
 private resumePreparing:{token:string;abort:AbortController}|null=null;
 private failedRace:string|null=null;
 private resultRaceId:string|null=null;
 private readiness=0;
 private readinessAbort:AbortController|null=null;
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
  this.readinessAbort?.abort();this.preparing?.abort.abort();this.arenaWaiting?.abort.abort();this.resumePreparing?.abort.abort();this.resumePreparing=null;this.arenaWaiting=null;
  const old=this.game;
  if(old&&old!==game)void this.enqueueRenderer(async()=>{await old.stopRace();}).catch(()=>{});
  this.game=game;this.startedRace=null;this.preparing=null;this.failedRace=null;
  this.unsubInput=game.on('input',(input:Controls)=>{
   if(this.disconnected||document.hidden||this.latest?.phase!=='racing'||this.prediction?.finished||this.prediction?.dnf){this.controls={...NEUTRAL};return;}
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
  this.prediction=this.visual=null;this.controls={...NEUTRAL};this.accumulator=0;this.startedRace=null;this.preparing=null;this.arenaWaiting=null;this.arenaAckedToken=null;this.failedRace=null;this.resultRaceId=null;
  this.clockMeasured=false;this.lastUI=-Infinity;const generation=++this.generation;
  const current=()=>this.room===room&&generation===this.generation&&!this.disposed;
  room.reconnection.minUptime=0;room.reconnection.maxRetries=12;room.reconnection.maxDelay=2500;room.reconnection.maxEnqueuedMessages=0;
  this.saveToken(room.reconnectionToken);this.handlers.status('Tersambung');
  room.onMessage('snapshot',(snapshot:RoomSnapshot)=>{if(current())this.accept(snapshot);});
  room.onMessage('room_error',(error:{code:string;message:string})=>{
   if(!current())return;this.handlers.error(error.message,error.code);
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
   this.resumePreparing?.abort.abort();this.resumePreparing=null;
   this.handlers.status('Menyambungkan kembali…');
  });
  room.onReconnect(()=>{
   if(!current())return;this.disconnected=false;this.awaitingSync=true;this.pending=[];this.snapshots=[];this.controls={...NEUTRAL};this.accumulator=0;this.previous=performance.now();
   this.resumePreparing?.abort.abort();this.resumePreparing=null;
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
  const oldPhase=this.latest?.phase,newRace=this.latest?.raceId!==snapshot.raceId,hadScene=!!(this.startedRace||this.preparing||this.arenaWaiting);
  if(snapshot.phase==='aborted'&&oldPhase!=='aborted')this.handlers.error(snapshot.settlementError??'Balapan dibatalkan oleh server.');
  if(newRace){this.preparing?.abort.abort();this.arenaWaiting?.abort.abort();this.snapshots=[];this.pending=[];this.prediction=this.visual=null;this.accumulator=0;this.failedRace=null;this.arenaAckedToken=null;}
  // A pause, resume, or final phase starts a fresh visual timeline. Reusing a
  // pre-pause interpolation window could pull resumed cars backward for100ms.
  if(oldPhase!==snapshot.phase)this.snapshots=[];
  this.latest=snapshot;this.awaitingSync=false;this.snapshots.push(snapshot);if(this.snapshots.length>12)this.snapshots.shift();
  if(snapshot.phase!=='lobby')this.readinessAbort?.abort();
  if(this.resumePreparing&&(snapshot.phase!=='prayer_pause'||snapshot.prayerPause?.pauseToken!==this.resumePreparing.token)){this.resumePreparing.abort.abort();this.resumePreparing=null;}
  if(snapshot.phase==='prayer_pause'||snapshot.phase==='resume_countdown'){this.controls={...NEUTRAL};this.pending=[];this.accumulator=0;}
  if(snapshot.phase==='lobby'||snapshot.phase==='aborted'||(!snapshot.raceId&&hadScene)){
   this.preparing?.abort.abort();this.arenaWaiting?.abort.abort();
   this.startedRace=null;this.preparing=null;this.arenaWaiting=null;this.arenaAckedToken=null;this.failedRace=null;this.controls={...NEUTRAL};
   if(hadScene&&this.game){const game=this.game;void this.enqueueRenderer(async()=>{await game.stopRace();}).catch(()=>{});}
  }
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
  if(!game||!room||!raceId||!snapshot.racers.length||['lobby','aborted'].includes(snapshot.phase)||this.preparing?.raceId===raceId||this.failedRace===raceId)return;
  if(this.startedRace===raceId){void this.acknowledgeArena(snapshot);return;}
  const preparation={generation:this.generation,raceId,abort:new AbortController()};this.preparing=preparation;
  const current=()=>!this.disposed&&this.game===game&&this.room===room&&this.generation===preparation.generation&&this.latest?.raceId===raceId;
  const remaining=(snapshot.loadingDeadline??Date.now()+45000)-(Date.now()+this.clockOffset);
  const timer=setTimeout(()=>preparation.abort.abort(new Error('Waktu memuat arena habis. Coba turunkan kualitas grafis lalu ulangi.')),Math.max(100,Math.min(45000,remaining)));
  const wait=<T>(operation:Promise<T>|T)=>abortable(operation,preparation.abort.signal);
  try{
   await this.enqueueRenderer(async()=>{
    if(!current())return;await wait(game.ready);if(!current())return;
    await wait(this.ensureModels(game,snapshot.racers.map(r=>r.loadout.carId)));if(!current())return;
    await wait(game.configure({...snapshot.config,online:true,previewOnly:false}));if(!current())return;
    await wait(game.setLocalPlayer(room.sessionId));if(!current())return;
    await wait(game.startRace({raceId,startToken:snapshot.startToken,phase:'loading',startAt:null,config:snapshot.config,localRacerId:room.sessionId,loadouts:snapshot.racers.map(r=>({id:r.id,name:r.name,loadout:r.loadout,isBot:r.isBot}))}));
    if(current()){this.startedRace=raceId;game.applySnapshot(this.latest!);}
   });
   if(current())void this.acknowledgeArena(this.latest!);
  }catch(error){if(current())this.arenaPreparationFailed(snapshot,error);}
  finally{clearTimeout(timer);if(this.preparing===preparation)this.preparing=null;}
 }
 private arenaPreparationFailed(snapshot:RoomSnapshot,error:unknown){
  this.failedRace=snapshot.raceId;
  const message='Lintasan belum siap: '+(error instanceof Error?error.message:String(error));this.handlers.error(message,'ARENA_LOAD_FAILED');
  if(this.connected&&!this.awaitingSync&&this.latest?.phase==='loading'&&this.latest.raceId===snapshot.raceId&&this.latest.startToken===snapshot.startToken&&snapshot.startToken){
   this.room?.send('arena_failed',{raceId:snapshot.raceId,startToken:snapshot.startToken,reason:message.slice(0,240)});
  }
 }
 private async acknowledgeArena(snapshot:RoomSnapshot){
  const game=this.game,room=this.room,raceId=snapshot.raceId,token=snapshot.startToken,generation=this.generation;
  if(!game||!room||!raceId||!token||snapshot.phase!=='loading'||this.startedRace!==raceId||this.failedRace===raceId||this.arenaAckedToken===token||this.arenaWaiting?.token===token||document.hidden||!this.connected||this.awaitingSync)return;
  const waiting={raceId,token,abort:new AbortController()};this.arenaWaiting=waiting;
  const current=()=>!this.disposed&&this.game===game&&this.room===room&&this.generation===generation&&this.connected&&!this.awaitingSync&&this.latest?.phase==='loading'&&this.latest.raceId===raceId&&this.latest.startToken===token;
  try{
   if(!game.waitForRaceFrame)throw new Error('Renderer perlu diperbarui untuk memastikan arena sudah tampil. Muat ulang halaman.');
   // Apply the authoritative grid before waiting for an actual main-scene render.
   // This wait is outside the renderer queue so stopRace can cancel it immediately.
   game.applySnapshot(this.latest!);
   const remaining=(snapshot.loadingDeadline??Date.now()+45000)-(Date.now()+this.clockOffset);
   await abortable(game.waitForRaceFrame({raceId,startToken:token,minimumTick:snapshot.tick,timeoutMs:Math.max(100,Math.min(45000,remaining))}),waiting.abort.signal);
   if(current()&&!document.hidden){this.arenaAckedToken=token;room.send('arena_ready',{raceId,startToken:token});}
  }catch(error){if(current())this.arenaPreparationFailed(snapshot,error);}
  finally{if(this.arenaWaiting===waiting)this.arenaWaiting=null;}
 }
 private render=(now:number)=>{
  if(!this.room||this.disposed)return;
  const dt=Math.max(0,Math.min(.1,(now-this.previous)/1000));this.previous=now;const snapshot=this.latest;
  if(snapshot?.phase==='racing'&&this.startedRace===snapshot.raceId&&this.prediction&&!this.prediction.finished&&!this.prediction.dnf&&this.prediction.connected&&!this.disconnected&&!this.awaitingSync&&!document.hidden){
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
    if(snapshot.phase!=='racing'||racer.dnf)return racer;
    if(racer.finished)return interpolateFinisher(racer,this.snapshots,targetTime);
    if(racer.id===this.sessionId){
     if(this.prediction&&this.visual&&snapshot.phase==='racing'&&!racer.finished&&!racer.dnf&&racer.connected&&!this.disconnected&&!this.awaitingSync){
      const p=this.prediction,v=this.visual,blend=1-Math.exp(-dt*24);
      const snap=v.lastResetMs!==p.lastResetMs,x=snap?p.x:v.x+(p.x-v.x)*blend,z=snap?p.z:v.z+(p.z-v.z)*blend,heading=snap?p.heading:v.heading+shortestAngle(p.heading-v.heading)*blend;
      this.visual={...p,x,z,heading};
      return{...racer,x,z,heading,speed:p.speed,steerAngle:p.steerAngle,driftAngle:p.driftAngle,bodyRoll:p.bodyRoll,bodyPitch:p.bodyPitch,nitro:p.nitro,nitroActive:p.nitroActive,trackIdx:p.trackIdx,trackT:p.trackT};
     }
     return racer;
    }
    const ar=a.racers.find(p=>p.id===racer.id),br=b.racers.find(p=>p.id===racer.id);if(!ar||!br)return racer;
    return{...racer,x:ar.x+(br.x-ar.x)*alpha,z:ar.z+(br.z-ar.z)*alpha,heading:ar.heading+shortestAngle(br.heading-ar.heading)*alpha,steerAngle:ar.steerAngle+(br.steerAngle-ar.steerAngle)*alpha};
   });
   const extrapolation=snapshot.phase==='racing'?Math.min(250,Math.max(0,serverNow-snapshot.serverTime)):0;
   try{this.game.applySnapshot({...snapshot,serverTime:serverNow,elapsedMs:snapshot.elapsedMs+extrapolation,racers});}
   catch(error){this.startedRace=null;this.arenaPreparationFailed(snapshot,error);}
  }
  this.frame=requestAnimationFrame(this.render);
 };
 async ready(value:boolean){
  const room=this.room,game=this.game,generation=this.generation,readiness=++this.readiness;
  this.readinessAbort?.abort();this.readinessAbort=null;
  if(!room||!this.connected)throw new Error('Sambungan room belum siap.');
  if(!value){if(this.latest?.phase==='lobby'||this.latest?.phase==='loading')room.send('ready',{ready:false,assetsLoaded:false});return;}
  if(this.latest?.phase!=='lobby')return;
  if(!game)throw new Error('Tunggu model 3D selesai dimuat.');
  const current=()=>this.room===room&&this.game===game&&this.generation===generation&&this.readiness===readiness&&!this.disposed&&this.latest?.phase==='lobby';
  const abort=new AbortController();this.readinessAbort=abort;
  const timer=setTimeout(()=>abort.abort(new Error('Waktu memuat model habis. Periksa koneksi lalu coba lagi.')),45000);
  try{await this.enqueueRenderer(async()=>{
    if(!current())return;await abortable(game.ready,abort.signal);if(!current())return;
    const snapshot=this.latest!,required=[...snapshot.members.map(m=>m.loadout.carId),...Array.from({length:snapshot.config.bots},(_,i)=>CAR_IDS[i%CAR_IDS.length]!)];
    await abortable(this.ensureModels(game,required),abort.signal);if(!current())return;
    await abortable(game.configure({circuit:snapshot.config.circuit,previewOnly:true,online:true}),abort.signal);
    if(current()&&this.connected)room.send('ready',{ready:true,assetsLoaded:true});
   });
  }catch(error){if(!abort.signal.aborted||(error as Error).name!=='AbortError')throw error;}
  finally{clearTimeout(timer);if(this.readinessAbort===abort)this.readinessAbort=null;}
 }
 start(){if(this.connected)this.room?.send('start');}
 resumeReady(){return this.confirmResume();}
 private async confirmResume(){
  const room=this.room,game=this.game,snapshot=this.latest,pause=snapshot?.prayerPause,generation=this.generation;
  if(!room||!snapshot||!pause||snapshot.phase!=='prayer_pause'||!this.connected||document.hidden||pause.readyIds.includes(room.sessionId)||this.resumePreparing?.token===pause.pauseToken)return;
  const preparing={token:pause.pauseToken,abort:new AbortController()};this.resumePreparing=preparing;
  const current=()=>!this.disposed&&this.resumePreparing===preparing&&this.room===room&&this.game===game&&this.generation===generation&&this.connected&&!this.awaitingSync&&this.latest?.phase==='prayer_pause'&&this.latest.prayerPause?.pauseToken===pause.pauseToken;
  const timer=setTimeout(()=>preparing.abort.abort(new Error('Arena belum siap ditampilkan. Muat ulang atau coba lagi.')),45000);
  try{
   if(snapshot.raceId&&snapshot.racers.length){
    if(!game||!game.waitForRaceFrame)throw new Error('Tunggu arena selesai ditampilkan sebelum melanjutkan.');
    await abortable(this.enqueueRenderer(async()=>{}),preparing.abort.signal);if(!current())return;
    if(this.game!==game||this.startedRace!==snapshot.raceId)throw new Error('Arena belum siap. Tunggu pemuatan selesai lalu tekan Siap melanjutkan.');
    game.applySnapshot(this.latest!);
    await abortable(game.waitForRaceFrame({raceId:snapshot.raceId,startToken:snapshot.startToken??undefined,minimumTick:snapshot.tick,timeoutMs:45000}),preparing.abort.signal);
   }
   if(current()&&!document.hidden)room.send('resume_ready',{pauseToken:pause.pauseToken});
  }catch(error){if(current()){this.handlers.error((error as Error).message,'RESUME_NOT_READY');throw error;}}
  finally{clearTimeout(timer);if(this.resumePreparing===preparing)this.resumePreparing=null;}
 }
 setLoadout(loadout:Loadout){if(this.connected)this.room?.send('loadout',loadout);}
 neutral=()=>{
  this.controls={...NEUTRAL};
  // Zero controls immediately release throttle. Holding brake here would make
  // a stationary arcade car reverse while a window is blurred.
  if(this.connected&&!this.awaitingSync&&this.latest?.phase==='racing')this.room!.send('input',{...NEUTRAL,seq:++this.seq});
 };
 private visibility=()=>{if(document.hidden)this.neutral();else if(this.connected){this.accumulator=0;this.previous=performance.now();this.room?.send('sync');if(this.latest)void this.acknowledgeArena(this.latest);}};
 async leave(){
  const room=this.cleanup();if(room)await room.leave(true).catch(()=>{});this.handlers.left();
 }
 private cleanup(){
  const room=this.room,game=this.game;this.generation++;this.connectAttempt++;this.readiness++;this.connecting=false;
  this.readinessAbort?.abort();this.preparing?.abort.abort();this.arenaWaiting?.abort.abort();this.resumePreparing?.abort.abort();this.resumePreparing=null;
  this.room=null;this.disconnected=false;this.awaitingSync=true;this.latest=null;this.snapshots=[];this.prediction=this.visual=null;this.pending=[];this.controls={...NEUTRAL};this.accumulator=0;
  this.startedRace=null;this.preparing=null;this.arenaWaiting=null;this.arenaAckedToken=null;this.failedRace=null;cancelAnimationFrame(this.frame);
  if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer=null;this.saveToken(null);
  if(game)void this.enqueueRenderer(async()=>{await game.stopRace();}).catch(()=>{});
  return room;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;const room=this.cleanup();if(room){room.reconnection.enabled=false;void room.leave(true).catch(()=>{});}
  this.unsubInput?.();this.unsubInput=null;window.removeEventListener('blur',this.neutral);document.removeEventListener('visibilitychange',this.visibility);
 }
}
