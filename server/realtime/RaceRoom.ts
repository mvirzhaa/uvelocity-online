import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Room, ServerError, type AuthContext, type Client, type Server } from '@colyseus/core';
import { CAR_NAMES } from '../../shared/catalog.js';
import { DEFAULT_PHYSICS, freezeLoadout, validateRoomConfig } from '../../shared/config.js';
import { createRacer, sortRacers } from '../../shared/simulation.js';
import { TRACK_VERSION } from '../../shared/track.js';
import { CAR_IDS, STRIPE_IDS, type BeginRaceInput, type FrozenLoadout, type LoadoutSelection, type RacePhase, type RaceResult, type RaceSettlement, type RoomConfig, type RoomMember, type RoomSnapshot, type SessionUser, type RoomPrayerPause } from '../../shared/types.js';
import type {PrayerStatus} from '../../shared/prayer.js';
import type { RealtimeOptions, RealtimeServices } from './contracts.js';
import { RaceRuntime } from './RaceRuntime.js';

interface AuthenticatedEntry { user:SessionUser; loadout:FrozenLoadout; sessionHeaders:IncomingHttpHeaders }
interface Entry extends RoomMember { selection:LoadoutSelection }
interface PendingStart {
  raceId:string;token:string;roster:string[];deadline:number;input:BeginRaceInput|null;
  acknowledging:Set<string>;committing:boolean;persisted:boolean;cancelled:boolean;abortPromise?:Promise<unknown>;
}
interface InviteLookup { roomId:string;inviteCode:string;phase:RacePhase;config:RoomConfig;humans:number;joinable:boolean }

function headersRecord(headers:Headers):IncomingHttpHeaders {
  return Object.fromEntries(headers.entries());
}
function selection(value:unknown):LoadoutSelection {
  const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const carId=input.carId??'brz',color=input.color??'#2866b8',finish=input.finish??'metallic',rimId=input.rimId??'stock';
  if(!CAR_IDS.includes(carId as never)||typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color)||!['metallic','matte','gloss'].includes(String(finish))||typeof rimId!=='string'||rimId.length>80)throw new ServerError(400,'Pilihan kendaraan tidak valid.');
  if(input.rimColor!==undefined&&(typeof input.rimColor!=='string'||!/^#[\da-f]{6}$/i.test(input.rimColor)))throw new ServerError(400,'Warna velg tidak valid.');
  if(input.stockRimPainted!==undefined&&typeof input.stockRimPainted!=='boolean')throw new ServerError(400,'Status cat pelek standar tidak valid.');
  if(input.stripeId!==undefined&&!STRIPE_IDS.includes(input.stripeId as never))throw new ServerError(400,'Striping tidak valid.');
  if(input.stripeColor!==undefined&&(typeof input.stripeColor!=='string'||!/^#[\da-f]{6}$/i.test(input.stripeColor)))throw new ServerError(400,'Warna striping tidak valid.');
  if(input.appearanceVersion!==undefined&&(typeof input.appearanceVersion!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(input.appearanceVersion)))throw new ServerError(400,'Versi tampilan tidak valid.');
  return{carId:carId as LoadoutSelection['carId'],color,finish:finish as LoadoutSelection['finish'],rimId,...(typeof input.rimColor==='string'?{rimColor:input.rimColor}:{}),
    ...(typeof input.stockRimPainted==='boolean'?{stockRimPainted:input.stockRimPainted}:{}),
    ...(input.stripeId!==undefined?{stripeId:input.stripeId as LoadoutSelection['stripeId']}:{}),...(typeof input.stripeColor==='string'?{stripeColor:input.stripeColor}:{}),...(typeof input.appearanceVersion==='string'?{appearanceVersion:input.appearanceVersion}:{})};
}
function configFrom(value:Record<string,unknown>):RoomConfig {
  const config:Partial<RoomConfig>={};
  for(const key of['circuit','laps','bots','maxHumans','difficulty','collisionMode']as const)if(value[key]!==undefined)(config as Record<string,unknown>)[key]=value[key];
  try{return validateRoomConfig(config);}catch(error){throw new ServerError(400,(error as Error).message);}
}
function makeCode():string {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...randomBytes(6)].map(n=>alphabet[n%alphabet.length]).join('');
}

/** Register one room type. Dependencies stay in this trusted closure.
 *
 * Browser SDK0.18 contract:
 * const client=new Client(location.origin);
 * const {ticket}=await authenticatedCsrfPost('/api/race/ticket');
 * const room=await client.create('race',{ticket,...config,loadout});
 * // Invite lookup HTTP route returns roomId, then fetch a fresh one-use ticket:
 * const peer=await client.joinById(roomId,{ticket,loadout});
 * room.onMessage('snapshot',(snapshot:RoomSnapshot)=>...);
 * room.onMessage('room_error',({code,message})=>...);
 * room.onMessage('result',({result,reward})=>...); // own wallet reward only
 * room.send('ready',{ready:true,assetsLoaded:true});
 * room.send('start'); // host, all members ready; server freezes loadouts
 * // Loading snapshot contains startToken + the frozen arena. After its first render:
 * room.send('arena_ready',{raceId,startToken});
 * room.send('arena_failed',{raceId,startToken,reason}); // cancels for everyone
 * room.send('resume_ready',{pauseToken}); // after the room's minimum prayer pause
 * room.send('input',{seq,throttle,brake,steer,nitro,reset?,clientTick?});
 * room.send('loadout',{carId,color,finish,rimId}); // lobby only
 * room.send('sync'); // request a current complete snapshot
 * room.send('ping',{sentAt}); // receives 'pong' with serverTime
 * const token=room.reconnectionToken; await client.reconnect(token);
 * No client position, time, finish, balance, tuning or reward messages exist.
 */
export function registerRaceRooms(server:Server,services:RealtimeServices,options:RealtimeOptions={}) {
  const rooms=new Map<string,RaceRoom>();
  const now=options.now??Date.now;
  const reconnectSeconds=options.reconnectSeconds??20,countdownMs=options.countdownMs??3000,loadingTimeoutMs=options.loadingTimeoutMs??45000;
  class RaceRoom extends Room {
    // Up to120 fixed-step inputs plus ping/sync and occasional UI controls.
    maxMessagesPerSecond=180;
    patchRate=null;
    private config!:RoomConfig;
    private phase:RacePhase='lobby';
    private inviteCode='';
    private members=new Map<string,Entry>();
    private hostId:string|null=null;
    private raceId:string|null=null;
    private rulesetVersion:string|null=null;
    private startAt:number|null=null;
    private startToken:string|null=null;
    private pendingStart:PendingStart|null=null;
    private startedAt:number|null=null;
    private runtime:RaceRuntime|null=null;
    private settlementStarted=false;
    private settlementSaved=false;
    private settlementAttempts=0;
    private settlementError:string|undefined;
    private result:RaceResult|null=null;
    private settlement:RaceSettlement|null=null;
    private disposed=false;
    private pendingLoadouts=new Set<string>();
    private blockedSessions=new Set<string>();
    private checkingSessions=new Map<string,Promise<boolean>>();
    private gameplayCache=new Map<string,{status:PrayerStatus;expires:number}>();
    private checkingGameplay=new Map<string,Promise<boolean>>();
    private readyVersions=new Map<string,number>();
    private prayerPause:RoomPrayerPause|null=null;
    private handledPrayers=new Set<string>();
    private resumeScheduling:string|null=null;
    private resumeChecking=new Set<string>();
    private accessHoldAt:number|null=null;
    private lastActivity=now();

    static async onAuth(_token:string,raw:Record<string,unknown>,context:AuthContext):Promise<AuthenticatedEntry>{
      if(typeof raw?.ticket!=='string'||raw.ticket.length<16||raw.ticket.length>512)throw new ServerError(401,'Tiket balapan tidak valid. Masuk kembali.');
      const requestHeaders=headersRecord(context.headers),user=await services.consumeRaceTicket({ticket:raw.ticket,headers:requestHeaders});
      if(!user)throw new ServerError(401,'Tiket balapan telah kedaluwarsa atau dipakai.');
      const access=await services.gameplayAccess(user.id);
      if(!access.allowed)throw new ServerError(423,'PRAYER_BREAK: '+access.message);
      const loadout=freezeLoadout(await services.resolveLoadout(user.id,selection(raw.loadout??raw)));
      // Retained only in Colyseus server-side auth data; never placed in a
      // snapshot or matchmaking response. Reconnect rechecks this same session.
      return{user,loadout,sessionHeaders:{cookie:requestHeaders.cookie}};
    }
    async onCreate(raw:Record<string,unknown>){
      this.config=configFrom(raw);this.maxClients=this.config.maxHumans;
      do{this.inviteCode=makeCode();}while(rooms.has(this.inviteCode));
      rooms.set(this.inviteCode,this);
      await this.setPrivate(true);await this.setMetadata({inviteCode:this.inviteCode,circuit:this.config.circuit});
      this.onMessage('input',(client,value)=>{if(this.phase==='racing'&&!this.prayerPause&&this.cachedGameplayAllowed(client))this.runtime?.acceptInput(client.sessionId,value);});
      this.onMessage('ready',(client,value)=>{void this.setReady(client,value);});
      this.onMessage('resume_ready',(client,value)=>{void this.resumeReady(client,value);});
      this.onMessage('arena_ready',(client,value)=>{void this.arenaReady(client,value);});
      this.onMessage('arena_failed',(client,value)=>this.arenaFailed(client,value));
      this.onMessage('loadout',(client,value)=>{void this.changeLoadout(client,value);});
      this.onMessage('start',client=>{void this.start(client);});
      this.onMessage('sync',client=>{client.send('snapshot',this.snapshot());this.sendResult(client);});
      this.onMessage('ping',(client,value)=>client.send('pong',{sentAt:typeof value?.sentAt==='number'?value.sentAt:null,serverTime:now()}));
      this.clock.setInterval(()=>this.publish(),options.snapshotRateMs??50);
      this.clock.setInterval(()=>{if(!this.prayerPause&&this.phase==='lobby'&&now()-this.lastActivity>(options.lobbyIdleMs??600000))void this.disconnect(4020);},10000);
      this.clock.setInterval(()=>{for(const client of this.clients)void this.checkSession(client);},options.sessionCheckMs??30000);
      this.clock.setInterval(()=>{if(['lobby','loading','countdown','racing'].includes(this.phase))for(const client of this.clients)void this.checkGameplay(client,true);},1000);
      this.setFixedTimestep(()=>this.simulate(),DEFAULT_PHYSICS.tickRate);
      // Colyseus installs a fallback clock interval when patchRate=null before
      // onCreate. Remove it now that the fixed timestep owns clock.tick(); two
      // clock callers would steal each other's elapsed time and slow the race.
      this.patchRate=null;
    }
    async onJoin(client:Client,_options:unknown,auth?:AuthenticatedEntry){
      const entry=auth??client.auth as AuthenticatedEntry;
      if(!entry?.user||this.phase!=='lobby'||this.prayerPause)throw new ServerError(403,'Room sedang balapan atau menjalani jeda bersama.');
      const checkedAt=now(),access=await services.gameplayAccess(entry.user.id);
      if(!access.allowed)throw new ServerError(423,'PRAYER_BREAK: '+access.message);
      if(this.phase!=='lobby'||this.prayerPause)throw new ServerError(403,'Persiapan room sudah dimulai.');
      if([...this.members.values()].some(member=>member.userId===entry.user.id))throw new ServerError(409,'Akun ini sudah berada di room. Gunakan sambung ulang.');
      if(!this.hostId)this.hostId=client.sessionId;
      this.members.set(client.sessionId,{id:client.sessionId,userId:entry.user.id,name:entry.user.displayName,host:client.sessionId===this.hostId,ready:false,assetsLoaded:false,arenaReady:false,connected:true,loadout:entry.loadout,selection:selection(entry.loadout)});
      this.rememberGameplay(client.sessionId,access,checkedAt);
      this.lastActivity=now();this.publish();
    }
    onDrop(client:Client){
      const member=this.members.get(client.sessionId);if(member)member.connected=false;
      if(this.prayerPause){this.prayerPause.readyIds=this.prayerPause.readyIds.filter(id=>id!==client.sessionId);this.prayerPause.resumeAt=null;}
      if(this.pendingStart&&!this.prayerPause)this.cancelStart(this.pendingStart,'START_DISCONNECTED','Seorang pemain terputus sebelum balapan dimulai. Kembali ke lobi dan tunggu semua pemain siap.');
      this.runtime?.setConnected(client.sessionId,false);this.publish();
      if(this.phase==='aborted'||this.blockedSessions.has(client.sessionId))return;
      this.allowReconnection(client,reconnectSeconds);
    }
    async onReconnect(client:Client){
      if(!await this.checkSession(client))return;
      const member=this.members.get(client.sessionId);if(member)member.connected=true;
      this.runtime?.setConnected(client.sessionId,true);
      if(this.prayerPause){this.prayerPause.readyIds=this.prayerPause.readyIds.filter(id=>id!==client.sessionId);this.prayerPause.resumeAt=null;}
      // Existing participants reconnect into their paused room even while their
      // personal window is active. No new-room ticket or session revocation.
      await this.checkGameplay(client,true);this.lastActivity=now();this.publish();this.sendResult(client);
    }
    onLeave(client:Client){
      if(this.pendingStart&&!this.prayerPause)this.cancelStart(this.pendingStart,'START_DISCONNECTED','Seorang pemain keluar sebelum balapan dimulai. Semua pemain kembali ke lobi.');
      if(this.prayerPause){
        this.prayerPause.requiredIds=this.prayerPause.requiredIds.filter(id=>id!==client.sessionId);this.prayerPause.readyIds=this.prayerPause.readyIds.filter(id=>id!==client.sessionId);
        if(this.pendingStart)this.pendingStart.roster=this.pendingStart.roster.filter(id=>id!==client.sessionId);
      }
      if(this.phase==='lobby'||this.phase==='loading'){
        this.members.delete(client.sessionId);this.pendingLoadouts.delete(client.sessionId);
        if(this.hostId===client.sessionId){this.hostId=this.members.keys().next().value??null;for(const member of this.members.values())member.host=member.id===this.hostId;}
      }else{
        const member=this.members.get(client.sessionId);if(member)member.connected=false;
        this.runtime?.markDnf(client.sessionId);
      }
      this.gameplayCache.delete(client.sessionId);this.readyVersions.delete(client.sessionId);
      if(this.prayerPause&&!this.prayerPause.requiredIds.length){this.prayerPause=null;this.lastActivity=now();}
      else if(this.prayerPause)void this.scheduleResume(this.prayerPause);
      this.publish();
    }
    async onDispose(){
      this.disposed=true;rooms.delete(this.inviteCode);
      const pending=this.pendingStart;
      if(pending){pending.cancelled=true;if(pending.persisted)await this.abortPending(pending,'room_disposed');}
      if(!pending&&this.raceId&&!this.settlementSaved&&this.phase!=='settling')await services.abortRace?.(this.raceId,'room_disposed').catch(error=>services.log?.('Abort race failed',error));
    }
    onUncaughtException(error:Error,method:string){
      services.log?.('Realtime exception in '+method,error);void this.abort('Gangguan server. Balapan dibatalkan.');
    }
    private visiblePhase():RacePhase{return this.prayerPause?(this.prayerPause.resumeAt===null?'prayer_pause':'resume_countdown'):this.phase;}
    lookup():InviteLookup{return{roomId:this.roomId,inviteCode:this.inviteCode,phase:this.visiblePhase(),config:this.config,humans:this.members.size,joinable:!this.prayerPause&&this.phase==='lobby'&&this.members.size<this.maxClients};}
    private snapshot():RoomSnapshot{
      return{protocol:1,roomId:this.roomId,inviteCode:this.inviteCode,raceId:this.raceId,phase:this.visiblePhase(),tick:this.runtime?.tick??0,serverTime:now(),elapsedMs:this.runtime?.elapsedMs??0,startAt:this.startAt,startToken:this.startToken,loadingDeadline:this.phase==='loading'?this.pendingStart?.deadline??null:null,prayerPause:this.prayerPause?structuredClone(this.prayerPause):null,config:this.config,rulesetVersion:this.rulesetVersion,trackVersion:TRACK_VERSION,physics:this.runtime?.physics??{...DEFAULT_PHYSICS},hostId:this.hostId,
        members:[...this.members.values()].map(({selection:_selection,...member})=>member),racers:this.runtime?.snapshots()??[],...(this.settlementError?{settlementError:this.settlementError}:{})};
    }
    private publish(){if(!this.disposed)this.broadcast('snapshot',this.snapshot());}
    private error(client:Client,code:string,message:string){client.send('room_error',{code,message});}
    private sendResult(client:Client){
      if(!this.result||!this.settlementSaved||!this.settlement)return;
      const member=this.members.get(client.sessionId);if(!member)return;
      client.send('result',{result:this.result,reward:this.settlement.rewards.find(reward=>reward.userId===member.userId)??null});
    }
    private rememberGameplay(id:string,status:PrayerStatus,checkedAt=now()){
      const untilNext=Date.parse(status.nextPrayer.startedAt)-Date.parse(status.serverNow);
      // The periodic refresh runs every second. A small overlap avoids normal
      // DB round trips stopping physics, while the known prayer instant is a
      // hard boundary. Use request time so a slow lookup cannot shift it later.
      const boundary=checkedAt+(Number.isFinite(untilNext)?untilNext:1500);
      this.gameplayCache.set(id,{status,expires:Math.min(checkedAt+1500,boundary)});
    }
    private cachedGameplayAllowed(client:Client){
      if(this.blockedSessions.has(client.sessionId)||!this.members.get(client.sessionId)?.connected)return false;
      const cache=this.gameplayCache.get(client.sessionId);
      if(cache&&cache.expires>now())return cache.status.allowed;
      void this.checkGameplay(client,true);return false;
    }
    private checkGameplay(client:Client,force=false):Promise<boolean>{
      const member=this.members.get(client.sessionId);if(!member||!member.connected||this.blockedSessions.has(client.sessionId))return Promise.resolve(false);
      const cached=this.gameplayCache.get(client.sessionId);if(!force&&cached&&cached.expires>now())return Promise.resolve(cached.status.allowed);
      const pending=this.checkingGameplay.get(client.sessionId);if(pending)return pending;
      const checkedAt=now();
      const check=(async()=>{
        try{
          const status=await services.gameplayAccess(member.userId);
          if(this.disposed||this.members.get(client.sessionId)!==member||!member.connected||!this.clients.includes(client))return false;
          this.rememberGameplay(client.sessionId,status,checkedAt);this.observePrayer(member,status);return status.allowed;
        }catch(error){
          this.gameplayCache.delete(client.sessionId);services.log?.('Gameplay access check failed',error);return false;
        }
      })().finally(()=>this.checkingGameplay.delete(client.sessionId));
      this.checkingGameplay.set(client.sessionId,check);return check;
    }
    private observePrayer(member:Entry,status:PrayerStatus){
      const event=status.currentPrayer;
      if(status.allowed||!event||!['lobby','loading','countdown','racing'].includes(this.phase))return;
      const key=member.userId+'|'+event.eventId;if(this.handledPrayers.has(key))return;
      // Keep the recorded pause start and its minimum hold on one clock sample.
      // A second read can advance even within this synchronous method.
      const observedAt=now(),startedAt=Date.parse(event.startedAt),resumesAt=Math.max(Date.parse(event.resumesAt),startedAt+15*60*1000),holdUntil=Math.max(resumesAt,observedAt+15*60*1000);
      if(!Number.isFinite(startedAt)||!Number.isFinite(resumesAt)||resumesAt<=observedAt)return;
      this.handledPrayers.add(key);
      const previousPhase=this.phase as RoomPrayerPause['previousPhase'];
      if(this.phase==='loading')this.cancelStart(this.pendingStart,'PRAYER_PAUSE','Persiapan arena dihentikan untuk jeda bersama.',false);
      const trigger={eventId:event.eventId,userId:member.userId,displayName:member.name,prayer:event.prayer,name:event.name,startedAt,resumesAt};
      if(this.prayerPause){
        this.prayerPause.pauseToken=randomUUID();this.prayerPause.resumeEligibleAt=Math.max(this.prayerPause.resumeEligibleAt,holdUntil);this.prayerPause.resumeAt=null;
        this.prayerPause.triggers.push(trigger);this.prayerPause.readyIds=[];
      }else{
        const requiredIds=[...this.members.values()].filter(person=>!this.runtime?.racers.find(racer=>racer.id===person.id)?.dnf).map(person=>person.id);
        this.prayerPause={pauseToken:randomUUID(),startedAt:observedAt,resumeEligibleAt:holdUntil,resumeAt:null,previousPhase,triggers:[trigger],requiredIds,readyIds:[]};
      }
      this.runtime?.clearControls();this.accessHoldAt=null;
      for(const person of this.members.values()){this.readyVersions.set(person.id,(this.readyVersions.get(person.id)??0)+1);if(this.phase==='lobby'){person.ready=false;person.assetsLoaded=false;person.arenaReady=false;}}
      void this.lock().catch(error=>services.log?.('Lock prayer pause failed',error));this.publish();
    }
    private async setReady(client:Client,value:unknown){
      const version=(this.readyVersions.get(client.sessionId)??0)+1;this.readyVersions.set(client.sessionId,version);
      const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
      if(this.prayerPause){this.error(client,'PRAYER_PAUSED','Room sedang jeda. Gunakan Siap melanjutkan setelah waktu minimum selesai.');return;}
      if(this.phase==='loading'&&input.ready===false&&this.members.has(client.sessionId)){
        this.cancelStart(this.pendingStart,'START_CANCELLED','Persiapan dibatalkan karena seorang pemain belum siap. Semua pemain perlu menekan Siap kembali.');return;
      }
      if(this.phase!=='lobby'||this.pendingLoadouts.has(client.sessionId))return;
      const member=this.members.get(client.sessionId);if(!member)return;
      if(input.ready===true&&!await this.checkGameplay(client,true))return;
      if(this.phase!=='lobby'||this.prayerPause||this.readyVersions.get(client.sessionId)!==version||this.pendingLoadouts.has(client.sessionId)||!member.connected)return;
      member.ready=input.ready===true;member.assetsLoaded=input.assetsLoaded===true;member.arenaReady=false;this.lastActivity=now();this.publish();
    }
    private async resumeReady(client:Client,value:unknown){
      const pause=this.prayerPause,input=value&&typeof value==='object'?value as Record<string,unknown>:null;
      if(!pause||input?.pauseToken!==pause.pauseToken||!pause.requiredIds.includes(client.sessionId)||!this.members.get(client.sessionId)?.connected){this.error(client,'RESUME_REJECTED','Konfirmasi tidak cocok dengan jeda room yang aktif.');return;}
      if(now()<pause.resumeEligibleAt){this.error(client,'RESUME_TOO_EARLY','Jeda minimum belum selesai. Tunggu hingga tombol Siap melanjutkan tersedia.');return;}
      const token=pause.pauseToken,key=client.sessionId+'|'+token;
      if(pause.readyIds.includes(client.sessionId)||this.resumeChecking.has(key)){this.error(client,'RESUME_REJECTED','Kesiapan melanjutkan sudah diterima.');return;}
      this.resumeChecking.add(key);
      try{
        if(!await this.checkSession(client)||!await this.checkGameplay(client,true))return;
        if(this.prayerPause!==pause||pause.pauseToken!==token||now()<pause.resumeEligibleAt||!pause.requiredIds.includes(client.sessionId)||!this.members.get(client.sessionId)?.connected)return;
        pause.readyIds.push(client.sessionId);this.publish();void this.scheduleResume(pause);
      }finally{this.resumeChecking.delete(key);}
    }
    private async scheduleResume(pause:RoomPrayerPause){
      const allReady=()=>pause.requiredIds.length>0&&pause.requiredIds.every(id=>pause.readyIds.includes(id)&&this.members.get(id)?.connected);
      if(this.disposed||this.prayerPause!==pause||pause.resumeAt!==null||now()<pause.resumeEligibleAt||!allReady())return;
      const token=pause.pauseToken;if(this.resumeScheduling===token)return;this.resumeScheduling=token;
      try{
        const clients=pause.requiredIds.map(id=>this.clients.find(client=>client.sessionId===id));if(clients.some(client=>!client))return;
        const checked=await Promise.all(clients.map(async client=>({id:client!.sessionId,allowed:await this.checkGameplay(client!,true)})));
        // A participant may leave while the final access reads are in flight.
        // Its failed/absent check must not strand the already-consenting racers
        // who remain, and no removed participant is re-added to the requirement.
        if(this.disposed||this.prayerPause!==pause||pause.pauseToken!==token||!allReady()||now()<pause.resumeEligibleAt||pause.requiredIds.some(id=>!checked.find(value=>value.id===id)?.allowed))return;
        pause.resumeAt=now()+3000;this.publish();
      }finally{if(this.resumeScheduling===token)this.resumeScheduling=null;}
    }
    private checkSession(client:Client):Promise<boolean>{
      if(this.blockedSessions.has(client.sessionId))return Promise.resolve(false);
      const pending=this.checkingSessions.get(client.sessionId);if(pending)return pending;
      const check=(async()=>{
        const auth=client.auth as AuthenticatedEntry;let user:SessionUser|null=null;
        try{user=await services.authenticate(auth.sessionHeaders);}catch{ /* fail closed */ }
        if(!user||user.id!==auth.user.id){
          this.blockedSessions.add(client.sessionId);this.runtime?.markDnf(client.sessionId);
          const member=this.members.get(client.sessionId);if(member)member.connected=false;
          if(this.pendingStart&&!this.prayerPause)this.cancelStart(this.pendingStart,'START_DISCONNECTED','Sesi seorang pemain berakhir sebelum start. Semua pemain kembali ke lobi.');
          const current=this.clients.find(c=>c.sessionId===client.sessionId)??client;
          this.error(current,'SESSION_EXPIRED','Sesi sudah berakhir. Silakan masuk kembali.');current.leave(4001,'Session expired');this.publish();return false;
        }
        return true;
      })().finally(()=>this.checkingSessions.delete(client.sessionId));
      this.checkingSessions.set(client.sessionId,check);return check;
    }
    private async changeLoadout(client:Client,value:unknown){
      if(this.phase!=='lobby'||this.prayerPause||this.pendingLoadouts.has(client.sessionId))return;
      const member=this.members.get(client.sessionId);if(!member)return;
      this.readyVersions.set(client.sessionId,(this.readyVersions.get(client.sessionId)??0)+1);
      this.pendingLoadouts.add(client.sessionId);member.ready=false;member.assetsLoaded=false;member.arenaReady=false;
      try{if(!await this.checkGameplay(client,true)||this.prayerPause)return;const chosen=selection(value),loadout=freezeLoadout(await services.resolveLoadout(member.userId,chosen));if(this.phase==='lobby'&&!this.prayerPause&&this.members.has(member.id)){member.selection=chosen;member.loadout=loadout;this.lastActivity=now();}}
      catch{this.error(client,'LOADOUT_REJECTED','Akses kendaraan atau konfigurasi berubah. Gunakan mobil yang dapat diakses dan tampilan yang sudah dibayar.');}
      finally{this.pendingLoadouts.delete(client.sessionId);this.publish();}
    }
    private async start(client:Client){
      if(client.sessionId!==this.hostId){this.error(client,'HOST_ONLY','Hanya pembuat room yang dapat memulai.');return;}
      if(this.phase!=='lobby'||this.prayerPause)return;
      const people=[...this.members.values()];
      if(!people.length||this.pendingLoadouts.size||people.some(member=>!member.ready||!member.assetsLoaded||!member.connected)){this.error(client,'NOT_READY','Semua pemain harus siap dan selesai memuat kendaraan.');return;}
      const pending:PendingStart={raceId:randomUUID(),token:randomUUID(),roster:people.map(member=>member.id),deadline:now()+loadingTimeoutMs,input:null,acknowledging:new Set(),committing:false,persisted:false,cancelled:false};
      this.pendingStart=pending;this.raceId=pending.raceId;this.startToken=pending.token;this.startAt=null;this.startedAt=null;
      for(const member of people)member.arenaReady=false;
      this.phase='loading';this.autoDispose=false;
      try{
        await this.lock();if(!this.isCurrentStart(pending))return;this.publish();
        const access=await Promise.all(people.map(member=>{const present=this.clients.find(person=>person.sessionId===member.id);return present?this.checkGameplay(present,true):Promise.resolve(false);}));
        if(!this.isCurrentStart(pending))return;if(access.some(allowed=>!allowed))throw new Error('Gameplay access changed before start');
        const ruleset=await services.getActiveRuleset();if(!this.isCurrentStart(pending))return;this.rulesetVersion=ruleset.version;
        const frozen=await Promise.all(people.map(async member=>({...member,loadout:freezeLoadout(await services.resolveLoadout(member.userId,member.selection,ruleset.version))})));
        if(!this.isCurrentStart(pending))return;
        if(frozen.some(member=>!this.members.get(member.id)?.connected))throw new Error('Participant left before arena preparation');
        const racers=frozen.map(member=>{this.members.get(member.id)!.loadout=member.loadout;return createRacer(member.id,member.name,member.loadout,member.userId);});
        const palette=['#ae3047','#86a8cf','#ba984d','#4d9b85','#bb704a','#6a71b8','#c8cfd3','#a68ab9','#79a34f','#ddbc65','#4686a0','#a35d73','#d3b89b','#688992'];
        for(let i=0;i<this.config.bots;i++){
          const carId=CAR_IDS[i%CAR_IDS.length]!,stats=ruleset.cars[carId];
          if(!stats)throw new Error('Ruleset is missing a bot vehicle');
          racers.push(createRacer('bot_'+i,CAR_NAMES[carId]+' · BOT '+String(i+1).padStart(2,'0'),freezeLoadout({carId,color:palette[i]!,finish:'metallic',rimId:'stock',stats,tuningVersion:ruleset.version}),null,true));
        }
        for(let i=racers.length-1;i>0;i--){const j=randomInt(i+1);[racers[i],racers[j]]=[racers[j]!,racers[i]!];}
        this.runtime=new RaceRuntime(this.config,racers,ruleset.physics,options.inputTimeoutMs??400,options.maxRaceDurationMs);
        pending.input={raceId:pending.raceId,roomId:this.roomId,inviteCode:this.inviteCode,config:this.config,rulesetVersion:ruleset.version,createdAt:new Date(now()).toISOString(),participants:racers.map(r=>({id:r.id,userId:r.userId,isBot:r.isBot,name:r.name,carId:r.loadout.carId,loadout:r.loadout}))};
        // The frozen scene is now sent to everyone, but no race row, clock,
        // countdown or input processing starts until every arena acknowledges.
        this.publish();
      }catch(error){
        services.log?.('Cannot prepare race',error);this.cancelStart(pending,'START_FAILED','Balapan belum dapat dimulai. Periksa akses mobil, konfigurasi tersimpan, dan kesiapan pemain.');
      }
    }
    private isCurrentStart(pending:PendingStart){return!this.disposed&&!pending.cancelled&&this.pendingStart===pending&&(this.phase==='loading'||this.phase==='countdown');}
    private validArenaMessage(client:Client,value:unknown):PendingStart|null{
      const pending=this.pendingStart,input=value&&typeof value==='object'?value as Record<string,unknown>:null,member=this.members.get(client.sessionId);
      if(this.prayerPause||this.phase!=='loading'||!pending?.input||!input||input.raceId!==pending.raceId||input.startToken!==pending.token||!pending.roster.includes(client.sessionId)||!member?.connected||this.blockedSessions.has(client.sessionId)||!this.clients.includes(client)){
        this.error(client,'ARENA_ACK_REJECTED','Konfirmasi arena tidak cocok dengan persiapan balapan yang aktif.');return null;
      }
      if(now()>=pending.deadline){this.cancelStart(pending,'ARENA_LOAD_TIMEOUT','Waktu memuat arena habis. Semua pemain kembali ke lobi; coba turunkan kualitas grafis lalu tekan Siap kembali.');return null;}
      return pending;
    }
    private async arenaReady(client:Client,value:unknown){
      const pending=this.validArenaMessage(client,value);if(!pending)return;
      const member=this.members.get(client.sessionId)!;
      if(member.arenaReady||pending.acknowledging.has(client.sessionId)){this.error(client,'ARENA_ACK_REJECTED','Konfirmasi arena pemain ini sudah diterima.');return;}
      pending.acknowledging.add(client.sessionId);
      try{
        if(!await this.checkSession(client)||!await this.checkGameplay(client,true)||!this.isCurrentStart(pending)||this.phase!=='loading')return;
        if(now()>=pending.deadline){this.cancelStart(pending,'ARENA_LOAD_TIMEOUT','Waktu memuat arena habis. Semua pemain kembali ke lobi.');return;}
        if(!member.connected||!this.clients.includes(client))return;
        member.arenaReady=true;this.publish();
        if(pending.roster.every(id=>this.members.get(id)?.arenaReady&&this.members.get(id)?.connected))void this.commitStart(pending);
      }finally{pending.acknowledging.delete(client.sessionId);}
    }
    private arenaFailed(client:Client,value:unknown){
      const pending=this.validArenaMessage(client,value);if(!pending)return;
      const reason=(value as {reason?:unknown}).reason;services.log?.('Client arena preparation failed',typeof reason==='string'?reason.slice(0,240):'Unknown renderer failure');
      const name=this.members.get(client.sessionId)?.name??'Seorang pemain';
      this.cancelStart(pending,'ARENA_LOAD_FAILED',name+' belum berhasil memuat arena. Semua pemain kembali ke lobi; periksa koneksi dan coba lagi.');
    }
    private async commitStart(pending:PendingStart){
      if(!this.isCurrentStart(pending)||pending.committing||!pending.input||this.phase!=='loading')return;
      pending.committing=true;
      try{
        const clients=pending.roster.map(id=>this.clients.find(client=>client.sessionId===id));
        if(clients.some(client=>!client))throw new Error('Participant disconnected before countdown');
        const authenticated=await Promise.all(clients.map(async client=>await this.checkSession(client!)&&await this.checkGameplay(client!,true)));
        if(!this.isCurrentStart(pending))return;
        if(authenticated.some(valid=>!valid))throw new Error('Session ended before countdown');
        await services.beginRace(pending.input);pending.persisted=true;
        if(!this.isCurrentStart(pending)){await this.abortPending(pending,'loading_cancelled');return;}
        if(now()>=pending.deadline){this.cancelStart(pending,'ARENA_LOAD_TIMEOUT','Waktu persiapan habis sebelum start. Semua pemain kembali ke lobi.');return;}
        if(pending.roster.some(id=>!this.members.get(id)?.connected||!this.members.get(id)?.arenaReady))throw new Error('Participant left while saving the race');
        this.startAt=now()+countdownMs;this.phase='countdown';this.setFixedTimestep(()=>this.simulate(),this.runtime!.physics.tickRate);this.publish();
      }catch(error){
        services.log?.('Cannot commit race start',error);
        if(pending.persisted)await this.abortPending(pending,'start_failed');
        this.cancelStart(pending,'START_FAILED','Balapan belum dapat dimulai. Periksa akses mobil, konfigurasi tersimpan, dan kesiapan pemain.');
      }
    }
    private abortPending(pending:PendingStart,reason:string){
      return pending.abortPromise??=(services.abortRace?.(pending.raceId,reason)??Promise.resolve()).catch(error=>services.log?.('Abort preparation failed',error));
    }
    private cancelStart(pending:PendingStart|null,code:string,message:string,announce=true){
      if(!pending||!this.isCurrentStart(pending))return;
      pending.cancelled=true;this.pendingStart=null;
      if(pending.persisted)void this.abortPending(pending,'loading_cancelled');
      // If beginRace is in flight, commitStart owns aborting its eventual row.
      this.raceId=null;this.runtime=null;this.rulesetVersion=null;this.startToken=null;this.startAt=null;this.startedAt=null;
      this.phase='lobby';this.autoDispose=true;this.lastActivity=now();
      for(const member of this.members.values()){this.readyVersions.set(member.id,(this.readyVersions.get(member.id)??0)+1);member.ready=false;member.assetsLoaded=false;member.arenaReady=false;}
      void this.unlock().catch(error=>services.log?.('Unlock cancelled start failed',error));
      if(announce){this.broadcast('room_error',{code,message});this.publish();}
    }
    private simulate(){
      if(!this.prayerPause&&(this.phase==='racing'||this.phase==='countdown')){
        let trusted=true;
        for(const client of this.clients){
          const member=this.members.get(client.sessionId),racer=this.runtime?.racers.find(candidate=>candidate.id===client.sessionId);
          if(member?.connected&&!racer?.dnf&&!this.cachedGameplayAllowed(client))trusted=false;
        }
        if(!trusted){if(this.accessHoldAt===null){this.accessHoldAt=now();this.runtime?.clearControls();}return;}
        if(this.accessHoldAt!==null){if(this.phase==='countdown'&&this.startAt!==null)this.startAt+=Math.max(0,now()-this.accessHoldAt);this.accessHoldAt=null;}
      }
      const pause=this.prayerPause;
      if(pause){
        if(pause.resumeAt===null||now()<pause.resumeAt)return;
        if(pause.requiredIds.some(id=>!pause.readyIds.includes(id)||!this.members.get(id)?.connected)){pause.resumeAt=null;this.publish();return;}
        const clients=pause.requiredIds.map(id=>this.clients.find(client=>client.sessionId===id));
        if(clients.some(client=>!client||!this.cachedGameplayAllowed(client)))return;
        if(this.prayerPause!==pause||pause.resumeAt===null)return;
        this.prayerPause=null;this.runtime?.clearControls();this.accessHoldAt=null;this.lastActivity=now();
        if(this.phase==='countdown')this.startAt=pause.resumeAt;
        if(this.phase==='lobby')void this.unlock().catch(error=>services.log?.('Unlock resumed lobby failed',error));
        this.publish();
      }
      if(this.phase==='loading'&&this.pendingStart&&now()>=this.pendingStart.deadline){this.cancelStart(this.pendingStart,'ARENA_LOAD_TIMEOUT','Waktu memuat arena habis. Semua pemain kembali ke lobi; coba turunkan kualitas grafis lalu tekan Siap kembali.');return;}
      if(this.phase==='countdown'&&this.startAt!==null&&now()>=this.startAt){
        if(this.pendingStart?.roster.some(id=>!this.members.get(id)?.connected||!this.members.get(id)?.arenaReady)){this.cancelStart(this.pendingStart,'START_DISCONNECTED','Seorang pemain belum siap saat start. Semua pemain kembali ke lobi.');return;}
        this.pendingStart=null;this.startedAt=this.startAt;this.phase='racing';this.publish();
      }
      if(this.phase!=='racing'||!this.runtime)return;
      this.runtime.step();
      if(this.runtime.ended&&!this.settlementStarted){this.settlementStarted=true;this.phase='settling';this.publish();void this.settle();}
    }
    private buildResult():RaceResult{
      const runtime=this.runtime!;
      return{raceId:this.raceId!,roomId:this.roomId,inviteCode:this.inviteCode,config:this.config,rulesetVersion:this.rulesetVersion!,startedAt:new Date(this.startedAt??now()).toISOString(),endedAt:new Date(now()).toISOString(),durationMs:runtime.elapsedMs,
        participants:sortRacers(runtime.racers).map((r,index)=>({id:r.id,userId:r.userId,isBot:r.isBot,name:r.name,carId:r.loadout.carId,loadout:r.loadout,status:r.finished?'finished':'dnf',position:index+1,completedLaps:r.completedLaps,bestLapMs:r.bestLapMs,totalTimeMs:r.finishTimeMs,progress:r.progress,distanceMeters:r.distanceMeters,connectedAtFinish:r.connected}))};
    }
    private async settle(){
      if(this.disposed||this.settlementSaved)return;
      this.result??=this.buildResult();this.settlementAttempts++;
      try{
        this.settlement=await services.finalizeRace(this.result);this.settlementSaved=true;this.settlementError=undefined;this.phase='finished';this.publish();
        for(const client of this.clients)this.sendResult(client);
        this.clock.setTimeout(()=>{void this.disconnect();},options.finishRetentionMs??60000);
      }catch(error){
        services.log?.('Race settlement will retry',error);this.settlementError='Hasil sedang disimpan. Hadiah tidak akan diberikan dua kali.';this.publish();
        this.clock.setTimeout(()=>{void this.settle();},Math.min(30000,1000*2**Math.min(this.settlementAttempts,5)));
      }
    }
    private async abort(message:string){
      if(this.phase==='finished'||this.phase==='aborted')return;this.phase='aborted';this.settlementError=message;
      if(this.raceId)await services.abortRace?.(this.raceId,'simulation_failure').catch(error=>services.log?.('Abort failed',error));
      this.publish();this.clock.setTimeout(()=>{void this.disconnect(4021);},10000);
    }
  }
  server.define('race',RaceRoom);
  return{
    findByCode(code:string):InviteLookup|null {return typeof code==='string'?rooms.get(code.trim().toUpperCase())?.lookup()??null:null;},
    /** Operational introspection, never exposed as a client mutation API. */
    get count(){return rooms.size;},
  };
}
